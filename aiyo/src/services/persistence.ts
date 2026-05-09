"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";
import { useChatStore } from "@/stores/useChatStore";
import { useMapStore } from "@/stores/useMapStore";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";
import { getSyncMutationSource, withSyncMutationSource } from "@/stores/syncMutationSource";
import { useVideoStore } from "@/stores/useVideoStore";

const STORAGE_VERSION = 4;
const STORAGE_PREFIX = `aiyo:persistence:v${STORAGE_VERSION}`;
const LEGACY_KEYS = ["aiyo:persistence:v2", "aiyo:persistence:v3"];
const SAVE_DELAY_MS = 350;

let activeStorageKey: string | null = null;
let persistenceUnsubscribers: (() => void)[] = [];

/** 已完成至少一次伺服端 bootstrap 的本機使用者鍵（id 或 email），供 Strict Mode 重掛載時略過 reset + localStorage 覆寫。 */
const serverHydratedUserKeys = new Set<string>();

interface PersistedState {
  version: number;
  chat?: {
    messages: ReturnType<typeof useChatStore.getState>["messages"];
    conversations?: ReturnType<typeof useChatStore.getState>["conversations"];
    activeConversationId?: ReturnType<typeof useChatStore.getState>["activeConversationId"];
  };
  trip?: Pick<
    ReturnType<typeof useTripStore.getState>,
    | "tripId"
    | "title"
    | "destination"
    | "days"
    | "budget"
    | "itinerary"
    | "planSummary"
    | "lastUpdatedAt"
  >;
  map?: Pick<
    ReturnType<typeof useMapStore.getState>,
    "pins" | "selectedPinId" | "lastSyncedAt"
  >;
  profile?: Pick<
    ReturnType<typeof useUserStore.getState>,
    | "name"
    | "email"
    | "travelPreferences"
    | "budget"
    | "destination"
    | "travelDays"
    | "preferredTransport"
    | "travelPace"
    | "interests"
    | "isFirstVisit"
  >;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function getPersistenceStorageKey(userKey: string): string {
  return `${STORAGE_PREFIX}:${userKey}`;
}

function loadStateFromKey(storageKey: string): PersistedState | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }

    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== STORAGE_VERSION) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function saveStateToKey(storageKey: string, state: PersistedState): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

/** @deprecated Prefer getPersistenceStorageKey + loadStateFromKey */
export function loadState(): PersistedState | null {
  if (!activeStorageKey) {
    return null;
  }
  return loadStateFromKey(activeStorageKey);
}

/** @deprecated Use saveStateToKey with active key */
export function saveState(state: PersistedState): void {
  if (!activeStorageKey) {
    return;
  }
  saveStateToKey(activeStorageKey, state);
}

export function clearPersistedState(): void {
  if (!isBrowser()) {
    return;
  }

  clearPersistenceServerHydrated();

  for (const key of LEGACY_KEYS) {
    window.localStorage.removeItem(key);
  }
  if (activeStorageKey) {
    window.localStorage.removeItem(activeStorageKey);
  }
}

export function markPersistenceServerHydrated(user: { id?: string | null; email?: string | null }) {
  if (user.id) {
    serverHydratedUserKeys.add(String(user.id));
  }
  if (user.email) {
    serverHydratedUserKeys.add(String(user.email));
  }
}

export function clearPersistenceServerHydrated() {
  serverHydratedUserKeys.clear();
}

function shouldSkipPersistenceResetAfterServerHydrate(userKey: string): boolean {
  return serverHydratedUserKeys.has(userKey);
}

export function debounce<T extends (...args: never[]) => void>(
  fn: T,
  wait = SAVE_DELAY_MS,
) {
  let timeoutId: number | null = null;
  return (...args: Parameters<T>) => {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
    timeoutId = window.setTimeout(() => fn(...(args as never[])), wait);
  };
}

function resetInMemoryStores(): void {
  useChatStore.setState({
    conversations: [],
    activeConversationId: null,
    messages: [],
    isSending: false,
    errorMessage: null,
  });
  useTripStore.setState(EMPTY_TRIP_STATE);
  useMapStore.setState({
    pins: [],
    selectedPinId: null,
    panelOpen: true,
    lastSyncedAt: null,
  });
  useUserStore.setState({
    name: "",
    email: "",
    travelPreferences: [],
    budget: 0,
    destination: "",
    travelDays: 1,
    preferredTransport: "",
    travelPace: "moderate",
    interests: [],
    isFirstVisit: true,
  });
  useUIStore.setState({
    showOnboarding: true,
    voiceState: "idle",
    chatBubbleOpen: false,
    activeVideoDrawer: null,
  });
  useVideoStore.setState({
    videos: [],
    selectedVideo: null,
    searchQuery: "",
    recommendationSource: null,
    summaryDiagnostics: null,
    isSearching: false,
    isSummarizing: false,
    errorMessage: null,
  });
}

function buildStateSnapshot(): PersistedState {
  const chat = useChatStore.getState();
  const trip = useTripStore.getState();
  const map = useMapStore.getState();
  const profile = useUserStore.getState();

  return {
    version: STORAGE_VERSION,
    chat: {
      messages: chat.messages,
      conversations: chat.conversations,
      activeConversationId: chat.activeConversationId,
    },
    trip: {
      tripId: trip.tripId,
      title: trip.title,
      destination: trip.destination,
      days: trip.days,
      budget: trip.budget,
      itinerary: trip.itinerary,
      planSummary: trip.planSummary,
      lastUpdatedAt: trip.lastUpdatedAt,
    },
    map: {
      pins: map.pins,
      selectedPinId: map.selectedPinId,
      lastSyncedAt: map.lastSyncedAt,
    },
    profile: {
      name: profile.name,
      email: profile.email,
      travelPreferences: profile.travelPreferences,
      budget: profile.budget,
      destination: profile.destination,
      travelDays: profile.travelDays,
      preferredTransport: profile.preferredTransport,
      travelPace: profile.travelPace,
      interests: profile.interests,
      isFirstVisit: profile.isFirstVisit,
    },
  };
}

function hydrateStores(persisted: PersistedState | null): void {
  if (!persisted) {
    return;
  }

  withSyncMutationSource("bootstrap", () => {
    if (persisted.chat) {
      const activeConversation = persisted.chat.conversations?.find(
        (conversation) => conversation.id === persisted.chat?.activeConversationId,
      );
      useChatStore.setState({
        conversations: persisted.chat.conversations || [],
        activeConversationId: persisted.chat.activeConversationId || null,
        messages: activeConversation?.messages || persisted.chat.messages,
      });
    }
    if (persisted.trip) {
      useTripStore.setState(persisted.trip);
    }
    if (persisted.map) {
      useMapStore.setState(persisted.map);
    }
    if (persisted.profile) {
      useUserStore.setState(persisted.profile);
      useUIStore.setState({ showOnboarding: persisted.profile.isFirstVisit });
    }
  });
}

function teardownPersistenceSubscriptions(): void {
  persistenceUnsubscribers.forEach((unsubscribe) => unsubscribe());
  persistenceUnsubscribers = [];
}

/**
 * teardown subs → 依使用者載入：
 * - 若已對同一 userKey 完成伺服端 bootstrap（Strict Mode 第二次掛載）：不重設記憶體、不以 localStorage 覆蓋。
 * - 否則：reset → hydrate localStorage → 綁定 autosave subscribe。
 */
export function initializePersistenceForUser(userKey: string): () => void {
  if (!isBrowser()) {
    return () => undefined;
  }

  teardownPersistenceSubscriptions();

  activeStorageKey = getPersistenceStorageKey(userKey);

  const skipResetBecauseServerAlreadyApplied = shouldSkipPersistenceResetAfterServerHydrate(userKey);

  if (!skipResetBecauseServerAlreadyApplied) {
    resetInMemoryStores();

    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }

    const persisted = loadStateFromKey(activeStorageKey);
    hydrateStores(persisted);
  }

  const debouncedSave = debounce(() => {
    if (activeStorageKey) {
      saveStateToKey(activeStorageKey, buildStateSnapshot());
    }
  });

  const saveIfLocalUserEdit = () => {
    if (getSyncMutationSource() !== "local-user-edit") {
      return;
    }
    debouncedSave();
  };

  persistenceUnsubscribers = [
    useChatStore.subscribe(saveIfLocalUserEdit),
    useTripStore.subscribe(saveIfLocalUserEdit),
    useMapStore.subscribe(saveIfLocalUserEdit),
    useUserStore.subscribe(saveIfLocalUserEdit),
  ];

  return () => {
    teardownPersistenceSubscriptions();
    activeStorageKey = null;
  };
}

export function PersistenceBootstrap() {
  const { data: session, status } = useSession();
  const userKey =
    status === "loading" ? null : (session?.user?.id || session?.user?.email || "guest");

  useEffect(() => {
    if (status === "unauthenticated") {
      clearPersistenceServerHydrated();
    }
  }, [status]);

  useEffect(() => {
    if (userKey === null) {
      return;
    }
    return initializePersistenceForUser(String(userKey));
  }, [userKey]);

  return null;
}
