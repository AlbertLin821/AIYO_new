import { zhTW as t } from "@/locales/zh-TW";
import { repairSparseItineraryFromLatestChatTravelPlan } from "@/lib/generatedTripPlan";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { hydrateItineraryTransportFields } from "@/services/itineraryTransport";
import { markPersistenceServerHydrated, persistActiveUserSnapshotNow } from "@/services/persistence";
import {
  applyLocationUpdatesToItinerary,
  collectItineraryItemsMissingLocation,
  collectItineraryItemsMissingPlacePhotos,
  enrichItineraryItemsMissingPlacePhotos,
  geocodeItineraryItemsMissingLocation,
  resolveGeocodeQueryForItem,
} from "@/services/geocodeItineraryItems";
import { reconcileTripMapState } from "@/services/mapSync";
import { apiDelete, apiGet, apiPost, apiPut } from "@/services/apiClient";
import { getRemoteConversationId, useChatStore } from "@/stores/useChatStore";
import { useCollabStore } from "@/stores/useCollabStore";
import { useMapStore } from "@/stores/useMapStore";
import { getSyncMutationSource, withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";
import type {
  BootstrapPayload,
  CollaborationPresenceState,
  PersistedTripPayload,
  User,
} from "@/types";

function debouncedVoidRunner(fn: () => void, wait: number) {
  let timeoutId: number | null = null;
  const cancel = () => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
      timeoutId = null;
    }
  };
  const schedule = () => {
    cancel();
    timeoutId = window.setTimeout(() => {
      timeoutId = null;
      fn();
    }, wait);
  };
  return { schedule, cancel };
}

async function withRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
    }
  }
  throw lastError;
}

class SyncService {
  private eventSource: EventSource | null = null;
  private roomId: string | null = null;
  private hydrated = false;
  private realtimeErrorShown = false;
  private realtimeReconnectWarnTimer: number | null = null;
  private manuallyClosingRealtime = false;
  private isApplyingRemote = false;
  private isSyncing = false;
  private lastSyncedPayloadKey: string | null = null;
  private lastLocationHydrationKey: string | null = null;
  private lastPhotoHydrationKey: string | null = null;
  private lastTransportHydrationKey: string | null = null;
  private debouncedTripSync = debouncedVoidRunner(() => {
    void this.syncTripState("debounced");
  }, 350);

  isHydrated(): boolean {
    return this.hydrated;
  }

  /** Call when session ends so guests do not reuse a prior authenticated hydrate flag. */
  resetSessionState() {
    this.debouncedTripSync.cancel();
    this.hydrated = false;
    this.lastSyncedPayloadKey = null;
    this.lastLocationHydrationKey = null;
    this.lastPhotoHydrationKey = null;
    this.lastTransportHydrationKey = null;
    this.isSyncing = false;
    this.isApplyingRemote = false;
  }

  flushTripSyncNow(options?: { keepalive?: boolean; force?: boolean }) {
    if ((!this.hydrated && !options?.force) || (this.isApplyingRemote && !options?.force)) {
      return Promise.resolve();
    }
    this.debouncedTripSync.cancel();
    return this.syncTripState("flush", options);
  }

  /** Mark current local trip payload as synced so realtime/bootstrap will not overwrite it. */
  markLocalTripPayloadAsSynced() {
    const payload = this.buildCurrentTripPayload();
    this.lastSyncedPayloadKey = this.getPayloadKey(payload);
    this.log("local trip payload marked synced", { tripId: payload.tripId, days: payload.days });
  }

  private log(message: string, payload?: Record<string, unknown>) {
    // if (process.env.NODE_ENV !== "production") {
    //   console.info(`[sync] ${message}`, payload || {});
    // }
  }

  private applyReconciledTripSnapshot(
    trip: PersistedTripPayload,
    budget: number | undefined,
    source: "bootstrap" | "realtime" | "server-ack",
  ) {
    const reconciled = reconcileTripMapState(trip.itinerary, trip.pins);
    const nextTrip: PersistedTripPayload = {
      ...trip,
      itinerary: reconciled.itinerary,
      pins: reconciled.pins,
    };
    useTripStore.getState().setRemoteTrip(nextTrip, budget, source);
    useMapStore.getState().setPins(reconciled.pins, source);
    return nextTrip;
  }

  private normalizePayload(payload: PersistedTripPayload) {
    return {
      tripId: payload.tripId || "",
      title: payload.title,
      destination: payload.destination,
      days: payload.days,
      budget: payload.budget || 0,
      itinerary: payload.itinerary.map((day) => ({
        dayNumber: day.dayNumber,
        theme: day.theme || "",
        summary: day.summary || "",
        items: day.items.map((item) => ({
          id: item.id,
          dayNumber: item.dayNumber || day.dayNumber,
          time: item.time,
          title: item.title,
          type: item.type,
          transport: item.transport || "",
          transportDurationMinutes: item.transportDurationMinutes || 0,
          transportDistanceMeters: item.transportDistanceMeters || 0,
          transportDataSource: item.transportDataSource || "",
          notes: item.notes || "",
          source: item.source || "manual",
          location: item.location
            ? {
                name: item.location.name,
                lat: item.location.lat,
                lng: item.location.lng,
                description: item.location.description,
                address: item.location.address || "",
                placeId: item.location.placeId || "",
                photoUrl: item.location.photoUrl || "",
                thumbnail: item.location.thumbnail || "",
                openingHours: item.location.openingHours || "",
                phoneNumber: item.location.phoneNumber || "",
                website: item.location.website || "",
                googleMapsUrl: item.location.googleMapsUrl || "",
                rating: item.location.rating || 0,
                userRatingsTotal: item.location.userRatingsTotal || 0,
                confidence: item.location.confidence || 0,
                verified: item.location.verified === true,
              }
            : null,
        })),
      })),
      pins: payload.pins.map((pin) => ({
        id: pin.id,
        name: pin.name,
        lat: pin.lat,
        lng: pin.lng,
        description: pin.description,
        address: pin.address || "",
        placeId: pin.placeId || "",
        photoUrl: pin.photoUrl || "",
        thumbnail: pin.thumbnail || "",
        openingHours: pin.openingHours || "",
        phoneNumber: pin.phoneNumber || "",
        website: pin.website || "",
        googleMapsUrl: pin.googleMapsUrl || "",
        rating: pin.rating || 0,
        userRatingsTotal: pin.userRatingsTotal || 0,
        color: pin.color || "",
        linkedTripItemId: pin.linkedTripItemId || "",
        dayNumber: pin.dayNumber || 0,
        source: pin.source || "manual",
        confidence: pin.confidence || 0,
        verified: pin.verified === true,
      })),
      coverImageUrl: payload.coverImageUrl ?? "",
    };
  }

  private getPayloadKey(payload: PersistedTripPayload) {
    return JSON.stringify(this.normalizePayload(payload));
  }

  private buildLocationHydrationKey(payload: PersistedTripPayload) {
    const missingItems = collectItineraryItemsMissingLocation(payload.itinerary);
    if (missingItems.length === 0) {
      return null;
    }
    return JSON.stringify({
      tripId: payload.tripId || "",
      destination: payload.destination || "",
      items: missingItems.map(({ dayNumber, item }) => ({
        dayNumber,
        itemId: item.id,
        query: resolveGeocodeQueryForItem(item),
      })),
    });
  }

  private buildPhotoHydrationKey(payload: PersistedTripPayload) {
    const photoMissingItems = collectItineraryItemsMissingPlacePhotos(payload.itinerary);
    if (photoMissingItems.length === 0) {
      return null;
    }
    return JSON.stringify({
      tripId: payload.tripId || "",
      destination: payload.destination || "",
      items: photoMissingItems.map(({ dayNumber, item }) => ({
        dayNumber,
        itemId: item.id,
        placeId: item.location?.placeId ?? "",
        lat: item.location?.lat ?? null,
        lng: item.location?.lng ?? null,
      })),
    });
  }

  private buildTransportHydrationKey(payload: PersistedTripPayload) {
    const candidates = payload.itinerary.flatMap((day) =>
      day.items.map((item, index) => ({
        dayNumber: day.dayNumber,
        itemId: item.id,
        index,
        transport: item.transport || "",
        duration: item.transportDurationMinutes || 0,
        distance: item.transportDistanceMeters || 0,
        hasLocation: Boolean(item.location && hasUsableMapCoordinate(item.location)),
      })),
    );
    const needsHydration = candidates.some(
      (item) =>
        item.index > 0 &&
        (!item.transport.trim() || item.transport.toLowerCase() === "ai_recommend" || item.duration <= 0 || item.distance <= 0),
    );
    if (!needsHydration) {
      return null;
    }
    return JSON.stringify({
      tripId: payload.tripId || "",
      destination: payload.destination || "",
      preferredTransport: useUserStore.getState().preferredTransport || "",
      items: candidates,
    });
  }

  async hydrateCurrentTripLocationsIfNeeded(options?: { force?: boolean }) {
    const payload = this.buildCurrentTripPayload();
    let nextItinerary = useTripStore.getState().itinerary;
    let changed = false;

    const missingItems = collectItineraryItemsMissingLocation(payload.itinerary);
    if (missingItems.length === 0) {
      this.lastLocationHydrationKey = null;
    } else {
      const hydrationKey = this.buildLocationHydrationKey(payload);
      if (hydrationKey) {
        if (options?.force || hydrationKey !== this.lastLocationHydrationKey) {
          this.lastLocationHydrationKey = hydrationKey;
          const updates = await geocodeItineraryItemsMissingLocation(
            missingItems,
            payload.destination,
          );
          if (updates.length > 0) {
            nextItinerary = applyLocationUpdatesToItinerary(nextItinerary, updates);
            changed = true;
          }
        }
      } else {
        this.lastLocationHydrationKey = null;
      }
    }

    const photoHydrationKey = this.buildPhotoHydrationKey({
      ...payload,
      itinerary: nextItinerary,
    });
    if (!photoHydrationKey) {
      this.lastPhotoHydrationKey = null;
    } else if (options?.force || photoHydrationKey !== this.lastPhotoHydrationKey) {
      this.lastPhotoHydrationKey = photoHydrationKey;
      const photoUpdates = await enrichItineraryItemsMissingPlacePhotos(
        collectItineraryItemsMissingPlacePhotos(nextItinerary),
        payload.destination,
      );
      if (photoUpdates.length > 0) {
        nextItinerary = applyLocationUpdatesToItinerary(nextItinerary, photoUpdates);
        changed = true;
      }
    }

    const transportHydrationKey = this.buildTransportHydrationKey({
      ...payload,
      itinerary: nextItinerary,
    });
    if (!transportHydrationKey) {
      this.lastTransportHydrationKey = null;
    } else if (options?.force || transportHydrationKey !== this.lastTransportHydrationKey) {
      this.lastTransportHydrationKey = transportHydrationKey;
      const hydratedTransport = hydrateItineraryTransportFields(nextItinerary, {
        destination: payload.destination,
        preferredTransport: useUserStore.getState().preferredTransport,
      });
      const transportChanged =
        JSON.stringify(hydratedTransport) !== JSON.stringify(nextItinerary);
      if (transportChanged) {
        nextItinerary = hydratedTransport;
        changed = true;
      }
    }

    if (!changed) {
      return false;
    }

    const reconciled = reconcileTripMapState(nextItinerary, useMapStore.getState().pins);

    withSyncMutationSource("local-user-edit", () => {
      useTripStore.setState({
        itinerary: reconciled.itinerary,
        lastUpdatedAt: new Date().toISOString(),
      });
      useMapStore.getState().setPins(reconciled.pins, "local-user-edit");
    });

    return true;
  }

  async loadBootstrap(): Promise<BootstrapPayload> {
    return apiGet<BootstrapPayload>("/api/bootstrap");
  }

  applyBootstrap(
    snapshot: BootstrapPayload,
    options?: { source?: string; forceTrip?: boolean },
  ) {
    const userStore = useUserStore.getState();
    const source = options?.source || "bootstrap";
    const localPayload = this.buildCurrentTripPayload();
    const localKey = this.getPayloadKey(localPayload);

    if (snapshot.trip) {
      const repairedItinerary = repairSparseItineraryFromLatestChatTravelPlan(
        snapshot.trip.itinerary,
        snapshot.chatMessages,
        snapshot.trip.days,
      );
      const nextSnapshotTrip = repairedItinerary
        ? { ...snapshot.trip, itinerary: repairedItinerary }
        : snapshot.trip;
      const remoteKey = this.getPayloadKey(snapshot.trip);
      const localUpdatedAt = useTripStore.getState().lastUpdatedAt;
      const remoteUpdatedAt = snapshot.trip.updatedAt;
      const localIsNewer =
        Boolean(localUpdatedAt && remoteUpdatedAt) &&
        Date.parse(localUpdatedAt || "") > Date.parse(remoteUpdatedAt || "");
      const localLooksDirty =
        this.hydrated &&
        localKey !== remoteKey &&
        localKey !== this.lastSyncedPayloadKey &&
        !options?.forceTrip;
      const identicalRemoteSnapshot =
        !options?.forceTrip &&
        remoteKey === this.lastSyncedPayloadKey &&
        localKey === remoteKey;

      if (identicalRemoteSnapshot) {
        // Ignore no-op realtime snapshots so the map/chat state does not keep re-applying.
      } else if (localLooksDirty && localIsNewer) {
        this.log("skip stale remote snapshot", {
          source,
          localUpdatedAt,
          remoteUpdatedAt,
        });
      } else {
        const tripSnapshotSource = source === "realtime" ? "realtime" : "bootstrap";
        this.isApplyingRemote = true;
        try {
          const nextTrip = this.applyReconciledTripSnapshot(
            nextSnapshotTrip,
            snapshot.profile.budget,
            tripSnapshotSource,
          );
          this.lastSyncedPayloadKey = this.getPayloadKey(nextTrip);
          this.log("remote snapshot applied", { source, updatedAt: remoteUpdatedAt });
        } finally {
          this.isApplyingRemote = false;
        }
      }
    } else {
      this.isApplyingRemote = true;
      try {
        const emptyTripSource = source === "realtime" ? "realtime" : "bootstrap";
        useTripStore.getState().resetTrip(emptyTripSource);
        useMapStore.getState().setPins([], "bootstrap");
        this.lastSyncedPayloadKey = null;
      } finally {
        this.isApplyingRemote = false;
      }
    }

    if (source === "realtime") {
      useChatStore.getState().mergeRemoteMessages(snapshot.chatMessages, {
        tripId: snapshot.trip?.tripId,
        title: snapshot.trip?.title,
      });
    } else {
      useChatStore.getState().setMessages(snapshot.chatMessages, {
        tripId: snapshot.trip?.tripId,
        title: snapshot.trip?.title,
      });
    }
    if (snapshot.trip?.tripId) {
      useChatStore.getState().setConversationTrip(
        getRemoteConversationId(snapshot.trip.tripId),
        snapshot.trip.tripId,
      );
    }

    if (snapshot.collaboration) {
      useCollabStore.getState().setCollaboration(snapshot.collaboration);
      this.roomId = snapshot.collaboration.roomId;
    } else {
      this.stopRealtime();
      useCollabStore.getState().resetCollaboration();
      this.roomId = null;
    }

    const currentProfile = {
      name: userStore.name,
      email: userStore.email,
      travelPreferences: userStore.travelPreferences,
      budget: userStore.budget,
      destination: userStore.destination,
      travelDays: userStore.travelDays,
      preferredTransport: userStore.preferredTransport,
      travelPace: userStore.travelPace,
      interests: userStore.interests,
      interestIcons: userStore.interestIcons,
    };

    if (JSON.stringify(currentProfile) !== JSON.stringify(snapshot.profile)) {
      useUserStore.setState((state) => ({ ...state, ...snapshot.profile }));
    }
    const onboardingDone = snapshot.onboardingCompleted;
    useUserStore.getState().setFirstVisit(!onboardingDone);
    useUIStore.setState({ showOnboarding: !onboardingDone });

    if (snapshot.user) {
      markPersistenceServerHydrated(snapshot.user);
    }

    this.hydrated = true;
    persistActiveUserSnapshotNow();
    if (snapshot.trip) {
      void this
        .hydrateCurrentTripLocationsIfNeeded({ force: true })
        .then((updated) => {
          if (updated) {
            return this.flushTripSyncNow({ force: true });
          }
          return undefined;
        })
        .catch(() => {});
    }
  }

  applyTripSwitch(snapshot: {
    trip: PersistedTripPayload;
    chatMessages?: BootstrapPayload["chatMessages"];
    collaboration: CollaborationPresenceState | null;
    selectConversation?: boolean;
  }) {
    const repairedItinerary = snapshot.chatMessages
      ? repairSparseItineraryFromLatestChatTravelPlan(
          snapshot.trip.itinerary,
          snapshot.chatMessages,
          snapshot.trip.days,
        )
      : null;
    const nextSnapshotTrip = repairedItinerary
      ? { ...snapshot.trip, itinerary: repairedItinerary }
      : snapshot.trip;
    this.isApplyingRemote = true;
    try {
      const nextTrip = this.applyReconciledTripSnapshot(
        nextSnapshotTrip,
        nextSnapshotTrip.budget,
        "bootstrap",
      );
      this.lastSyncedPayloadKey = this.getPayloadKey(nextTrip);
      this.log("trip switch snapshot applied", { tripId: nextSnapshotTrip.tripId });
    } finally {
      this.isApplyingRemote = false;
    }

    useChatStore.getState().setMessages(
      snapshot.chatMessages || [],
      {
        tripId: nextSnapshotTrip.tripId,
        title: nextSnapshotTrip.title,
      },
      { force: true },
    );
    if (snapshot.selectConversation !== false) {
      useChatStore.getState().selectConversation(getRemoteConversationId(nextSnapshotTrip.tripId));
    }

    if (snapshot.collaboration) {
      useCollabStore.getState().setCollaboration(snapshot.collaboration);
      this.roomId = snapshot.collaboration.roomId;
    } else {
      this.stopRealtime();
      useCollabStore.getState().resetCollaboration();
      this.roomId = null;
    }

    this.hydrated = true;
    persistActiveUserSnapshotNow();
    void this
      .hydrateCurrentTripLocationsIfNeeded({ force: true })
      .then((updated) => {
        if (updated) {
          return this.flushTripSyncNow({ force: true });
        }
        return undefined;
      })
      .catch(() => {});
  }

  startRealtime(roomId?: string | null) {
    if (!roomId) {
      return;
    }
    this.roomId = roomId;
    this.stopRealtime();
    useCollabStore.getState().setConnectionStatus("connecting");
    this.realtimeErrorShown = false;
    this.manuallyClosingRealtime = false;

    this.eventSource = new EventSource(`/api/realtime/stream?roomId=${roomId}`);
    this.eventSource.addEventListener("connected", () => {
      this.realtimeErrorShown = false;
      if (this.realtimeReconnectWarnTimer !== null) {
        window.clearTimeout(this.realtimeReconnectWarnTimer);
        this.realtimeReconnectWarnTimer = null;
      }
      useCollabStore.getState().setConnectionStatus("connected");
    });
    this.eventSource.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { data: BootstrapPayload };
      this.applyBootstrap(payload.data, { source: "realtime" });
    });
    this.eventSource.onerror = () => {
      if (this.manuallyClosingRealtime) {
        return;
      }
      useCollabStore.getState().setConnectionStatus("reconnecting");
      if (this.realtimeReconnectWarnTimer !== null || this.realtimeErrorShown) {
        return;
      }
      this.realtimeReconnectWarnTimer = window.setTimeout(() => {
        this.realtimeReconnectWarnTimer = null;
        if (this.manuallyClosingRealtime || useCollabStore.getState().connectionStatus === "connected") {
          return;
        }
        this.realtimeErrorShown = true;
        useToastStore.getState().pushToast({
          variant: "error",
          title: t.bootstrap.realtimeLostTitle,
          description: t.bootstrap.realtimeLostDesc,
        });
      }, 10_000);
    };
  }

  stopRealtime() {
    this.manuallyClosingRealtime = true;
    if (this.realtimeReconnectWarnTimer !== null) {
      window.clearTimeout(this.realtimeReconnectWarnTimer);
      this.realtimeReconnectWarnTimer = null;
    }
    this.eventSource?.close();
    this.eventSource = null;
    useCollabStore.getState().setConnectionStatus("disconnected");
  }

  scheduleTripSync(source = "unknown") {
    if (!this.hydrated || this.isApplyingRemote) {
      return;
    }
    if (getSyncMutationSource() !== "local-user-edit") {
      this.log("skip non-local trip sync trigger", {
        source,
        mutationSource: getSyncMutationSource(),
      });
      return;
    }
    this.log("schedule trip sync", { source });
    this.debouncedTripSync.schedule();
  }

  private buildCurrentTripPayload(): PersistedTripPayload {
    const trip = useTripStore.getState();
    const map = useMapStore.getState();
    return {
      tripId: trip.tripId || "",
      title: trip.title,
      destination: trip.destination,
      days: trip.days,
      budget: trip.budget,
      coverImageUrl: trip.coverImageUrl ?? null,
      itinerary: trip.itinerary,
      pins: map.pins,
      updatedAt: trip.lastUpdatedAt || new Date().toISOString(),
    };
  }

  async syncTripState(source = "manual", options?: { keepalive?: boolean; force?: boolean }) {
    const previousTrip = useTripStore.getState();
    const payload = this.buildCurrentTripPayload();
    const payloadKey = this.getPayloadKey(payload);

    if ((!this.hydrated && !options?.force) || (this.isApplyingRemote && !options?.force)) {
      return;
    }

    const noTripId = !payload.tripId?.trim();
    if (noTripId && payload.itinerary.length === 0) {
      this.log("skip sync without trip and empty itinerary", { source });
      return;
    }

    if (payloadKey === this.lastSyncedPayloadKey && !options?.force) {
      this.log("skip duplicate trip sync", { source });
      return;
    }
    if (this.isSyncing && !options?.force) {
      this.log("skip overlapping trip sync", { source });
      return;
    }

    this.isSyncing = true;
    try {
      this.log("sync trip state", { source, tripId: payload.tripId, days: payload.days });
      const savedTrip = await withRetry(() =>
        apiPut<PersistedTripPayload, PersistedTripPayload>(
          "/api/trips/current",
          payload,
          options?.keepalive ? { keepalive: true } : undefined,
        ),
      );

      this.isApplyingRemote = true;
      try {
        useTripStore.getState().setRemoteTrip(savedTrip, previousTrip.budget, "server-ack");
        useMapStore.getState().setPins(savedTrip.pins, "server-ack");
        this.lastSyncedPayloadKey = this.getPayloadKey(savedTrip);
      } finally {
        this.isApplyingRemote = false;
      }
      persistActiveUserSnapshotNow();
    } catch (error) {
      useToastStore.getState().pushToast({
        variant: "error",
        title: t.tripSync.failedTitle,
        description: error instanceof Error ? error.message : t.tripSync.failedDesc,
      });
    } finally {
      this.isSyncing = false;
    }
  }

  async saveProfile(input: Partial<User> & { welcomeCompleted?: boolean }) {
    return withRetry(() => apiPut<Partial<User> & { welcomeCompleted?: boolean }, User>("/api/profile", input));
  }

  async uploadAvatar(file: Blob) {
    const formData = new FormData();
    formData.append("avatar", file, "avatar.jpg");
    const response = await fetch("/api/profile/avatar", {
      method: "POST",
      body: formData,
      credentials: "include",
    });
    if (!response.ok) {
      const payload = (await response.json()) as { error?: { message?: string } };
      throw new Error(payload.error?.message || t.api.postFailed);
    }
    const payload = (await response.json()) as { data: { image: string } };
    return payload.data;
  }

  async addComment(roomId: string, content: string) {
    return withRetry(() =>
      apiPost<{ roomId: string; content: string }, CollaborationPresenceState>(
        "/api/collab/comments",
        { roomId, content },
      ),
    );
  }

  async deleteComment(roomId: string, commentId: string) {
    const qs = new URLSearchParams({ roomId, commentId }).toString();
    return withRetry(() => apiDelete<CollaborationPresenceState>(`/api/collab/comments?${qs}`));
  }

  async sendPresenceHeartbeat(input: {
    roomId: string;
    activeSection?: string;
    selectedEntityId?: string;
    cursorX?: number | null;
    cursorY?: number | null;
  }) {
    try {
      await apiPost<typeof input, { ok: boolean }>("/api/realtime/presence", input);
    } catch {
      // Presence updates should not crash the UI.
    }
  }
}

export const syncService = new SyncService();
