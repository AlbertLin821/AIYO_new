import { zhTW as t } from "@/locales/zh-TW";
import { apiDelete, apiGet, apiPost, apiPut } from "@/services/apiClient";
import { useChatStore } from "@/stores/useChatStore";
import { useCollabStore } from "@/stores/useCollabStore";
import { useMapStore } from "@/stores/useMapStore";
import { getSyncMutationSource } from "@/stores/syncMutationSource";
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

function debounce<T extends (...args: never[]) => void>(fn: T, wait = 700) {
  let timeoutId: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => fn(...(args as never[])), wait);
  };
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
  private isApplyingRemote = false;
  private isSyncing = false;
  private lastSyncedPayloadKey: string | null = null;
  private debouncedTripSync = debounce(() => {
    void this.syncTripState("debounced");
  }, 900);

  private log(message: string, payload?: Record<string, unknown>) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[sync] ${message}`, payload || {});
    }
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
          notes: item.notes || "",
          source: item.source || "manual",
          location: item.location
            ? {
                name: item.location.name,
                lat: item.location.lat,
                lng: item.location.lng,
                description: item.location.description,
                address: item.location.address || "",
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
        color: pin.color || "",
        linkedTripItemId: pin.linkedTripItemId || "",
        dayNumber: pin.dayNumber || 0,
        source: pin.source || "manual",
      })),
    };
  }

  private getPayloadKey(payload: PersistedTripPayload) {
    return JSON.stringify(this.normalizePayload(payload));
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
          useTripStore.getState().setRemoteTrip(
            snapshot.trip,
            snapshot.profile.budget,
            tripSnapshotSource,
          );
          useMapStore.getState().setPins(snapshot.trip.pins, tripSnapshotSource);
          this.lastSyncedPayloadKey = remoteKey;
          this.log("remote snapshot applied", { source, updatedAt: remoteUpdatedAt });
        } finally {
          this.isApplyingRemote = false;
        }
      }
    }

    if (source === "realtime") {
      useChatStore.getState().mergeRemoteMessages(snapshot.chatMessages);
    } else {
      useChatStore.getState().setMessages(snapshot.chatMessages);
    }

    if (snapshot.collaboration) {
      useCollabStore.getState().setCollaboration(snapshot.collaboration);
      this.roomId = snapshot.collaboration.roomId;
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
    };

    if (JSON.stringify(currentProfile) !== JSON.stringify(snapshot.profile)) {
      useUserStore.setState((state) => ({ ...state, ...snapshot.profile }));
    }
    useUserStore.getState().setFirstVisit(false);
    useUIStore.setState({ showOnboarding: false });

    this.hydrated = true;
  }

  startRealtime(roomId?: string | null) {
    if (!roomId) {
      return;
    }
    this.roomId = roomId;
    this.stopRealtime();
    useCollabStore.getState().setConnectionStatus("connecting");
    this.realtimeErrorShown = false;

    this.eventSource = new EventSource(`/api/realtime/stream?roomId=${roomId}`);
    this.eventSource.addEventListener("connected", () => {
      this.realtimeErrorShown = false;
      useCollabStore.getState().setConnectionStatus("connected");
    });
    this.eventSource.addEventListener("snapshot", (event) => {
      const payload = JSON.parse((event as MessageEvent).data) as { data: BootstrapPayload };
      this.applyBootstrap(payload.data, { source: "realtime" });
    });
    this.eventSource.onerror = () => {
      useCollabStore.getState().setConnectionStatus("reconnecting");
      if (!this.realtimeErrorShown) {
        this.realtimeErrorShown = true;
        useToastStore.getState().pushToast({
          variant: "error",
          title: t.bootstrap.realtimeLostTitle,
          description: t.bootstrap.realtimeLostDesc,
        });
      }
    };
  }

  stopRealtime() {
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
    this.debouncedTripSync();
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
      itinerary: trip.itinerary,
      pins: map.pins,
      updatedAt: trip.lastUpdatedAt || new Date().toISOString(),
    };
  }

  async syncTripState(source = "manual") {
    const previousTrip = useTripStore.getState();
    const payload = this.buildCurrentTripPayload();
    const payloadKey = this.getPayloadKey(payload);

    if (!this.hydrated || this.isApplyingRemote) {
      return;
    }
    if (payloadKey === this.lastSyncedPayloadKey) {
      this.log("skip duplicate trip sync", { source });
      return;
    }
    if (this.isSyncing) {
      this.log("skip overlapping trip sync", { source });
      return;
    }

    this.isSyncing = true;
    try {
      this.log("sync trip state", { source, tripId: payload.tripId, days: payload.days });
      const savedTrip = await withRetry(() =>
        apiPut<PersistedTripPayload, PersistedTripPayload>("/api/trips/current", payload),
      );

      this.isApplyingRemote = true;
      try {
        useTripStore.getState().setRemoteTrip(savedTrip, previousTrip.budget, "server-ack");
        useMapStore.getState().setPins(savedTrip.pins, "server-ack");
        this.lastSyncedPayloadKey = this.getPayloadKey(savedTrip);
      } finally {
        this.isApplyingRemote = false;
      }
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

  async saveProfile(input: Partial<User>) {
    return withRetry(() => apiPut<Partial<User>, User>("/api/profile", input));
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
