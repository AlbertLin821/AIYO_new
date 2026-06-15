import { dayNumberFromDayId } from "@/lib/assistantActions/converters";
import { reorderItemsWithRetime } from "@/lib/itineraryRetime";
import {
  collectMapFocusGeocodeTargets,
  maybeEnqueueItemGeocodeTarget,
  processPendingGeocodeTargets,
} from "@/lib/assistantActions/geocodeAssistantActionTargets";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { reconcileTripMapState } from "@/services/mapSync";
import { syncService } from "@/services/syncService";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import type { AssistantAction, AssistantActionItemInput, LocationReference, TripPlanItem } from "@/types";
import type { PendingGeocodeTarget } from "@/types/geocode";

type ActionSummaryEntry = {
  actionIndex: number;
  actionType: AssistantAction["type"];
  reason?: string;
};

export type AssistantActionExecutionSummary = {
  succeeded: ActionSummaryEntry[];
  skipped: ActionSummaryEntry[];
  failed: ActionSummaryEntry[];
};

export type ApplyAssistantActionsResult = {
  appliedCount: number;
  skippedCount: number;
  alreadyAppliedCount: number;
  summary: AssistantActionExecutionSummary;
};

function sourceToTripItemSource(source: AssistantActionItemInput["source"]): TripPlanItem["source"] {
  if (source === "video") return "video";
  if (source === "manual") return "manual";
  return "ai";
}

function itemType(category?: string | null): TripPlanItem["type"] {
  const raw = (category || "").toLowerCase();
  if (/餐|食|restaurant|food|meal|美食/.test(raw)) return "restaurant";
  if (/住宿|hotel/.test(raw)) return "hotel";
  if (/交通|transport/.test(raw)) return "transport";
  return "attraction";
}

function locationFromInput(input: AssistantActionItemInput | Partial<AssistantActionItemInput>): LocationReference | undefined {
  if (!input.location || input.lat == null || input.lng == null) {
    return undefined;
  }
  const location = {
    name: input.location,
    lat: input.lat,
    lng: input.lng,
    description: input.notes || input.location,
    address: input.address || undefined,
  };
  return hasUsableMapCoordinate(location) ? location : undefined;
}

function stableHash(input: string): string {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function stableActionKey(action: AssistantAction, actionIndex: number, requestId?: string): string {
  return stableHash(
    JSON.stringify({
      requestId: requestId || "no-request",
      actionIndex,
      type: action.type,
      payload: action.payload,
    }),
  );
}

function itemFromInput(input: AssistantActionItemInput, dayNumber: number, id?: string): TripPlanItem {
  return {
    id: id || `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dayNumber,
    time: input.startTime || "18:30",
    title: input.title,
    type: itemType(input.category),
    notes: input.notes || input.address || undefined,
    location: locationFromInput(input),
    source: sourceToTripItemSource(input.source),
  };
}

function reconcileMapWithTrip() {
  const trip = useTripStore.getState();
  const map = useMapStore.getState();
  const reconciled = reconcileTripMapState(trip.itinerary, map.pins);
  useTripStore.getState().setItinerary(reconciled.itinerary);
  useMapStore.getState().setPins(reconciled.pins);
}

export async function applyAssistantActions(
  actions: AssistantAction[],
  options: { persist?: boolean; geocode?: boolean; requestId?: string } = {},
): Promise<ApplyAssistantActionsResult> {
  let appliedCount = 0;
  let skippedCount = 0;
  let alreadyAppliedCount = 0;
  let tripMutated = false;
  const geocodeTargets: PendingGeocodeTarget[] = [];
  const geocodeSeen = new Set<string>();
  const tripState = useTripStore.getState();
  const summary: AssistantActionExecutionSummary = { succeeded: [], skipped: [], failed: [] };
  const geocodeContext = {
    tripId: tripState.tripId,
    destinationHint: tripState.destination,
  };

  for (const [actionIndex, action] of actions.entries()) {
    if (action.type === "map.focus_location") {
      useMapStore.getState().setFocusLocation(action.payload);
      const matchingPin = useMapStore
        .getState()
        .pins.find((pin) => pin.name.trim().toLowerCase() === action.payload.placeName.trim().toLowerCase());
      if (matchingPin) {
        useMapStore.getState().setSelectedPinId(matchingPin.id);
      }
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
      continue;
    }

    if (action.type === "trip.update_metadata") {
      const tripStore = useTripStore.getState();
      if (action.payload.title) {
        useTripStore.setState({ title: action.payload.title, lastUpdatedAt: new Date().toISOString() });
      }
      if (action.payload.destination) {
        tripStore.setDestination(action.payload.destination);
      }
      if (typeof action.payload.days === "number") {
        tripStore.resizeItineraryToDayCount(action.payload.days);
      }
      tripMutated = true;
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
      continue;
    }

    const dayNumber = dayNumberFromDayId(action.payload.dayId);
    let day = dayNumber
      ? useTripStore.getState().itinerary.find((candidate) => candidate.dayNumber === dayNumber)
      : null;
    if (action.type === "itinerary.add_item" && dayNumber && !day) {
      const tripStore = useTripStore.getState();
      if (dayNumber > tripStore.itinerary.length && dayNumber <= tripStore.itinerary.length + 1) {
        tripStore.resizeItineraryToDayCount(dayNumber);
        day = useTripStore.getState().itinerary.find((candidate) => candidate.dayNumber === dayNumber) ?? null;
      }
    }
    if (!dayNumber || !day) {
      skippedCount += 1;
      summary.failed.push({
        actionIndex,
        actionType: action.type,
        reason: "dayId does not exist in current trip",
      });
      continue;
    }

    if (action.type === "itinerary.add_item") {
      const actionKey = stableActionKey(action, actionIndex, options.requestId);
      const itemId = `assistant_${actionKey}`;
      if (day.items.some((item) => item.id === itemId)) {
        alreadyAppliedCount += 1;
        summary.skipped.push({
          actionIndex,
          actionType: action.type,
          reason: "already applied",
        });
        continue;
      }
      const newItem = itemFromInput(action.payload.item, dayNumber, itemId);
      useTripStore.getState().addItineraryItem(dayNumber, newItem);
      tripMutated = true;
      maybeEnqueueItemGeocodeTarget(geocodeTargets, geocodeSeen, {
        ...geocodeContext,
        dayId: action.payload.dayId,
        itemId: newItem.id,
        itemInput: action.payload.item,
        reason: "assistant_action_add",
      });
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
      continue;
    }

    if (action.type === "itinerary.remove_item") {
      useTripStore.getState().removeItineraryItem(dayNumber, action.payload.itemId);
      useMapStore.getState().setPins(
        useMapStore.getState().pins.filter((pin) => pin.linkedTripItemId !== action.payload.itemId),
      );
      tripMutated = true;
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
      continue;
    }

    if (action.type === "itinerary.reorder_items") {
      const reordered = reorderItemsWithRetime(day.items, action.payload.orderedItemIds);
      useTripStore.getState().setItinerary(
        useTripStore.getState().itinerary.map((candidate) =>
          candidate.dayNumber === dayNumber ? { ...candidate, items: reordered } : candidate,
        ),
      );
      tripMutated = true;
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
      continue;
    }

    if (action.type === "itinerary.replace_day") {
      useTripStore.getState().setItinerary(
        useTripStore.getState().itinerary.map((candidate) =>
          candidate.dayNumber === dayNumber
            ? {
                ...candidate,
                items: action.payload.items.map((item, index) =>
                  itemFromInput(item, dayNumber, `assistant_${stableActionKey(action, index, options.requestId)}`),
                ),
              }
            : candidate,
        ),
      );
      tripMutated = true;
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
      continue;
    }

    if (action.type === "itinerary.update_item") {
      const patch: Partial<TripPlanItem> = {};
      if (action.payload.patch.title !== undefined) patch.title = action.payload.patch.title;
      if (action.payload.patch.startTime !== undefined) patch.time = action.payload.patch.startTime || "";
      if (action.payload.patch.notes !== undefined) patch.notes = action.payload.patch.notes || undefined;
      if (action.payload.patch.transport !== undefined) patch.transport = action.payload.patch.transport || undefined;
      if (action.payload.patch.location !== undefined || action.payload.patch.lat !== undefined || action.payload.patch.lng !== undefined) {
        patch.location = locationFromInput(action.payload.patch);
        if (!patch.location) {
          useMapStore.getState().setPins(
            useMapStore.getState().pins.filter((pin) => pin.linkedTripItemId !== action.payload.itemId),
          );
        }
      }
      useTripStore.getState().updateItineraryItem(dayNumber, action.payload.itemId, patch);
      tripMutated = true;
      maybeEnqueueItemGeocodeTarget(geocodeTargets, geocodeSeen, {
        ...geocodeContext,
        dayId: action.payload.dayId,
        itemId: action.payload.itemId,
        itemInput: action.payload.patch,
        reason: "assistant_action_update",
      });
      appliedCount += 1;
      summary.succeeded.push({ actionIndex, actionType: action.type });
    }
  }

  geocodeTargets.push(...collectMapFocusGeocodeTargets(actions, geocodeContext));
  const geocodeEnabled = options.geocode ?? typeof window !== "undefined";

  if (geocodeEnabled) {
    await processPendingGeocodeTargets(geocodeTargets, { persist: false });
  }

  if (tripMutated) {
    reconcileMapWithTrip();
    if (options.persist !== false) {
      await syncService.flushTripSyncNow({ force: true });
    }
  }

  return { appliedCount, skippedCount, alreadyAppliedCount, summary };
}
