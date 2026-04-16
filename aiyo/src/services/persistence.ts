"use client";

import { useEffect } from "react";
import { useChatStore } from "@/stores/useChatStore";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";

// v3: bump to avoid accidentally resurrecting old demo/test data from earlier phases.
const STORAGE_KEY = "aiyo:persistence:v3";
const LEGACY_KEYS = ["aiyo:persistence:v2"];
const SAVE_DELAY_MS = 350;

interface PersistedState {
  version: number;
  chat?: {
    messages: ReturnType<typeof useChatStore.getState>["messages"];
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

export function loadState(): PersistedState | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    // Drop legacy persisted demo data silently.
    for (const key of LEGACY_KEYS) {
      window.localStorage.removeItem(key);
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as PersistedState;
    if (parsed.version !== 3) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  if (!isBrowser()) {
    return;
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function clearPersistedState(): void {
  if (!isBrowser()) {
    return;
  }

  for (const key of LEGACY_KEYS) {
    window.localStorage.removeItem(key);
  }
  window.localStorage.removeItem(STORAGE_KEY);
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

function buildStateSnapshot(): PersistedState {
  const chat = useChatStore.getState();
  const trip = useTripStore.getState();
  const map = useMapStore.getState();
  const profile = useUserStore.getState();

  return {
    version: 3,
    chat: {
      messages: chat.messages,
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

function hydrateStores(): void {
  const persisted = loadState();
  if (!persisted) {
    return;
  }

  if (persisted.chat) {
    useChatStore.setState(persisted.chat);
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
}

let initialized = false;

export function initializePersistence(): () => void {
  if (!isBrowser() || initialized) {
    return () => undefined;
  }

  initialized = true;
  hydrateStores();

  const debouncedSave = debounce(() => saveState(buildStateSnapshot()));
  const unsubscribers = [
    useChatStore.subscribe(() => debouncedSave()),
    useTripStore.subscribe(() => debouncedSave()),
    useMapStore.subscribe(() => debouncedSave()),
    useUserStore.subscribe(() => debouncedSave()),
  ];

  return () => {
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    initialized = false;
  };
}

export function PersistenceBootstrap() {
  useEffect(() => initializePersistence(), []);
  return null;
}
