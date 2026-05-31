import { dayNumberFromDayId } from "@/lib/assistantActions/converters";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { fetchGeocodedPlace } from "@/lib/places/geocodeClient";
import { reconcileTripMapState } from "@/services/mapSync";
import { syncService } from "@/services/syncService";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import type { AssistantAction, AssistantActionItemInput, LocationReference } from "@/types";
import type { GeocodedPlace, PendingGeocodeTarget } from "@/types/geocode";

function locationFromGeocoded(place: GeocodedPlace): LocationReference {
  return {
    name: place.placeName,
    lat: place.lat,
    lng: place.lng,
    description: place.formattedAddress || place.placeName,
    address: place.formattedAddress || undefined,
    placeId: place.placeId || undefined,
    resolvedFrom: "google-geocode",
    verified: true,
    confidence: place.confidence,
  };
}

function needsGeocodeForItemInput(input: AssistantActionItemInput | Partial<AssistantActionItemInput>): boolean {
  const hasCoords = input.lat != null && input.lng != null && hasUsableMapCoordinate({ lat: input.lat, lng: input.lng });
  if (hasCoords) {
    return false;
  }
  const query = (typeof input.location === "string" ? input.location : "").trim() || (input.title || "").trim();
  return query.length >= 2;
}

function resolveItemGeocodeQuery(
  input: AssistantActionItemInput | Partial<AssistantActionItemInput>,
): string {
  return (typeof input.location === "string" ? input.location : "").trim() || (input.title || "").trim();
}

export function enqueueGeocodeTarget(
  targets: PendingGeocodeTarget[],
  seen: Set<string>,
  target: PendingGeocodeTarget,
) {
  const key =
    target.reason === "map_focus"
      ? `focus:${target.query.toLowerCase()}`
      : `item:${target.dayId}:${target.itemId}:${target.query.toLowerCase()}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  targets.push(target);
}

export function maybeEnqueueItemGeocodeTarget(
  targets: PendingGeocodeTarget[],
  seen: Set<string>,
  input: {
    tripId?: string | null;
    dayId: string;
    itemId: string;
    itemInput: AssistantActionItemInput | Partial<AssistantActionItemInput>;
    destinationHint?: string | null;
    reason: "assistant_action_add" | "assistant_action_update";
  },
) {
  if (!needsGeocodeForItemInput(input.itemInput)) {
    return;
  }
  enqueueGeocodeTarget(targets, seen, {
    tripId: input.tripId || undefined,
    dayId: input.dayId,
    itemId: input.itemId,
    query: resolveItemGeocodeQuery(input.itemInput),
    destinationHint: input.destinationHint,
    reason: input.reason,
  });
}

export function collectMapFocusGeocodeTargets(
  actions: AssistantAction[],
  options: { tripId?: string | null; destinationHint?: string | null },
): PendingGeocodeTarget[] {
  const targets: PendingGeocodeTarget[] = [];
  const seen = new Set<string>();

  for (const action of actions) {
    if (action.type !== "map.focus_location") {
      continue;
    }
    const hasCoords =
      action.payload.lat != null &&
      action.payload.lng != null &&
      hasUsableMapCoordinate({ lat: action.payload.lat, lng: action.payload.lng });
    const query = action.payload.placeName.trim();
    if (!hasCoords && query.length >= 2) {
      enqueueGeocodeTarget(targets, seen, {
        tripId: options.tripId || undefined,
        dayId: "day-0",
        query,
        destinationHint: options.destinationHint,
        reason: "map_focus",
      });
    }
  }

  return targets;
}

function reconcileMapWithTrip() {
  const trip = useTripStore.getState();
  const map = useMapStore.getState();
  const reconciled = reconcileTripMapState(trip.itinerary, map.pins);
  useTripStore.getState().setItinerary(reconciled.itinerary);
  useMapStore.getState().setPins(reconciled.pins);
}

export async function processPendingGeocodeTargets(
  targets: PendingGeocodeTarget[],
  options: { persist?: boolean } = {},
): Promise<void> {
  if (!targets.length) {
    return;
  }

  let itineraryMutated = false;

  for (const target of targets) {
    const result = await fetchGeocodedPlace({
      query: target.query,
      destinationHint: target.destinationHint || undefined,
      countryHint: target.countryHint || undefined,
      tripId: target.tripId,
      dayId: target.dayId,
      itemId: target.itemId,
      purpose: target.reason === "map_focus" ? "map_focus" : "itinerary_item",
    });

    if (!result.ok) {
      if (target.reason === "map_focus") {
        useMapStore.getState().setFocusLocation({
          placeName: target.query,
          lat: null,
          lng: null,
        });
      }
      continue;
    }

    if (target.reason === "map_focus") {
      useMapStore.getState().setFocusLocation({
        placeName: result.place.placeName,
        lat: result.place.lat,
        lng: result.place.lng,
        zoom: 15,
      });
      continue;
    }

    const dayNumber = dayNumberFromDayId(target.dayId);
    if (!dayNumber || !target.itemId) {
      continue;
    }

    const location = locationFromGeocoded(result.place);
    useTripStore.getState().updateItineraryItem(dayNumber, target.itemId, { location });
    itineraryMutated = true;
  }

  if (itineraryMutated) {
    reconcileMapWithTrip();
    if (options.persist !== false) {
      await syncService.flushTripSyncNow({ force: true });
    }
  }
}
