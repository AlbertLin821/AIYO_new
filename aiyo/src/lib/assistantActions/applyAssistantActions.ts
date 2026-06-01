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

function itemFromInput(input: AssistantActionItemInput, dayNumber: number): TripPlanItem {
  return {
    id: `assistant_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
  options: { persist?: boolean; geocode?: boolean } = {},
): Promise<{ appliedCount: number; skippedCount: number }> {
  let appliedCount = 0;
  let skippedCount = 0;
  const geocodeTargets: PendingGeocodeTarget[] = [];
  const geocodeSeen = new Set<string>();
  const tripState = useTripStore.getState();
  const geocodeContext = {
    tripId: tripState.tripId,
    destinationHint: tripState.destination,
  };

  for (const action of actions) {
    if (action.type === "map.focus_location") {
      useMapStore.getState().setFocusLocation(action.payload);
      const matchingPin = useMapStore
        .getState()
        .pins.find((pin) => pin.name.trim().toLowerCase() === action.payload.placeName.trim().toLowerCase());
      if (matchingPin) {
        useMapStore.getState().setSelectedPinId(matchingPin.id);
      }
      appliedCount += 1;
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
      appliedCount += 1;
      continue;
    }

    const dayNumber = dayNumberFromDayId(action.payload.dayId);
    const day = dayNumber
      ? useTripStore.getState().itinerary.find((candidate) => candidate.dayNumber === dayNumber)
      : null;
    if (!dayNumber || !day) {
      skippedCount += 1;
      continue;
    }

    if (action.type === "itinerary.add_item") {
      const newItem = itemFromInput(action.payload.item, dayNumber);
      useTripStore.getState().addItineraryItem(dayNumber, newItem);
      maybeEnqueueItemGeocodeTarget(geocodeTargets, geocodeSeen, {
        ...geocodeContext,
        dayId: action.payload.dayId,
        itemId: newItem.id,
        itemInput: action.payload.item,
        reason: "assistant_action_add",
      });
      appliedCount += 1;
      continue;
    }

    if (action.type === "itinerary.remove_item") {
      useTripStore.getState().removeItineraryItem(dayNumber, action.payload.itemId);
      useMapStore.getState().setPins(
        useMapStore.getState().pins.filter((pin) => pin.linkedTripItemId !== action.payload.itemId),
      );
      appliedCount += 1;
      continue;
    }

    if (action.type === "itinerary.reorder_items") {
      const reordered = reorderItemsWithRetime(day.items, action.payload.orderedItemIds);
      useTripStore.getState().setItinerary(
        useTripStore.getState().itinerary.map((candidate) =>
          candidate.dayNumber === dayNumber ? { ...candidate, items: reordered } : candidate,
        ),
      );
      appliedCount += 1;
      continue;
    }

    if (action.type === "itinerary.replace_day") {
      useTripStore.getState().setItinerary(
        useTripStore.getState().itinerary.map((candidate) =>
          candidate.dayNumber === dayNumber
            ? {
                ...candidate,
                items: action.payload.items.map((item) => itemFromInput(item, dayNumber)),
              }
            : candidate,
        ),
      );
      appliedCount += 1;
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
      maybeEnqueueItemGeocodeTarget(geocodeTargets, geocodeSeen, {
        ...geocodeContext,
        dayId: action.payload.dayId,
        itemId: action.payload.itemId,
        itemInput: action.payload.patch,
        reason: "assistant_action_update",
      });
      appliedCount += 1;
    }
  }

  geocodeTargets.push(...collectMapFocusGeocodeTargets(actions, geocodeContext));

  if (appliedCount > 0) {
    reconcileMapWithTrip();
    if (options.persist !== false) {
      await syncService.flushTripSyncNow({ force: true });
    }
  }

  const geocodeEnabled = options.geocode ?? typeof window !== "undefined";
  if (geocodeEnabled) {
    await processPendingGeocodeTargets(geocodeTargets, { persist: options.persist !== false });
  }

  return { appliedCount, skippedCount };
}
