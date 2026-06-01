import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import {
  extractPrimaryPlaceName,
  shouldSkipDedicatedMapPinForItem,
} from "@/lib/itineraryPlaceTitle";
import { findLinkedPinForItem } from "@/lib/mapPinItineraryLink";
import type { LocationReference, MapPin, TripPlanDay, TripPlanItem } from "@/types";

const PIN_COLORS = [
  "#F4A7B9",
  "#7C9CBF",
  "#B8D8BA",
  "#C3B1E1",
  "#FFDAB9",
  "#FFB347",
  "#87CEEB",
];

function locationFromPin(pin: MapPin, item: TripPlanItem): LocationReference {
  return {
    name: pin.name,
    lat: pin.lat,
    lng: pin.lng,
    description: item.notes || pin.description || pin.name,
    address: pin.address,
    placeId: pin.placeId,
    photoUrl: pin.photoUrl,
    thumbnail: pin.thumbnail || pin.photoUrl,
    openingHours: pin.openingHours,
    phoneNumber: pin.phoneNumber,
    website: pin.website,
    googleMapsUrl: pin.googleMapsUrl,
    rating: pin.rating,
    userRatingsTotal: pin.userRatingsTotal,
    confidence: pin.confidence,
    verified: pin.verified,
  };
}

function buildItineraryPin(item: TripPlanItem, dayNumber: number, colorIndex: number): MapPin {
  const location = item.location!;
  const name = extractPrimaryPlaceName(location.name || item.title);
  return {
    id: `day_${dayNumber}_${item.id}`,
    name,
    lat: location.lat,
    lng: location.lng,
    description: item.notes || location.description,
    address: location.address,
    placeId: location.placeId,
    photoUrl: location.photoUrl,
    thumbnail: location.thumbnail,
    openingHours: location.openingHours,
    phoneNumber: location.phoneNumber,
    website: location.website,
    googleMapsUrl: location.googleMapsUrl,
    rating: location.rating,
    userRatingsTotal: location.userRatingsTotal,
    dayNumber,
    linkedTripItemId: item.id,
    color: PIN_COLORS[colorIndex % PIN_COLORS.length],
    source: "itinerary",
    confidence: location.confidence,
    verified: location.verified,
  };
}

function pinDedupeKey(pin: Pick<MapPin, "dayNumber" | "name" | "lat" | "lng">): string {
  return `${pin.dayNumber || 0}:${pin.name.trim().toLowerCase()}:${pin.lat.toFixed(5)}:${pin.lng.toFixed(5)}`;
}

function pinMatchesItem(pin: MapPin, item: TripPlanItem): boolean {
  if (pin.linkedTripItemId === item.id) {
    return true;
  }
  const linked = findLinkedPinForItem(item, [pin]);
  return linked?.id === pin.id;
}

export function buildPinsFromLocations(
  locations: LocationReference[],
  source: MapPin["source"] = "video",
): MapPin[] {
  const ordered = [...locations]
    .sort((a, b) => {
      const va = a.verified ? 1 : 0;
      const vb = b.verified ? 1 : 0;
      if (va !== vb) {
        return vb - va;
      }
      const ca = a.confidence ?? 0;
      const cb = b.confidence ?? 0;
      return cb - ca;
    })
    .filter((location) => hasUsableMapCoordinate(location))
    .filter((location, index, all) => {
      const normalized = location.name.trim().toLowerCase();
      return all.findIndex((entry) => entry.name.trim().toLowerCase() === normalized) === index;
    });

  return ordered.map((location, index) => ({
    id: `${source}_${location.name}_${index}`.replace(/\s+/g, "_").toLowerCase(),
    name: location.name,
    lat: location.lat,
    lng: location.lng,
    description: location.description,
    address: location.address,
    placeId: location.placeId,
    photoUrl: location.photoUrl,
    thumbnail: location.thumbnail,
    openingHours: location.openingHours,
    phoneNumber: location.phoneNumber,
    website: location.website,
    googleMapsUrl: location.googleMapsUrl,
    rating: location.rating,
    userRatingsTotal: location.userRatingsTotal,
    color: PIN_COLORS[index % PIN_COLORS.length],
    source,
    confidence: location.confidence,
    verified: location.verified,
  }));
}

export function buildPinsFromTripPlan(days: TripPlanDay[]): MapPin[] {
  const seen = new Set<string>();
  const pins: MapPin[] = [];

  for (const day of days) {
    for (const item of day.items) {
      if (shouldSkipDedicatedMapPinForItem({ title: item.title, type: item.type })) {
        continue;
      }
      if (!item.location) {
        continue;
      }
      if (!hasUsableMapCoordinate(item.location)) {
        continue;
      }
      const dedupeKey = `${day.dayNumber}:${item.location.name}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      pins.push(buildItineraryPin(item, day.dayNumber, pins.length));
    }
  }

  return pins;
}

/**
 * 以目前行程重建「行程」來源的地圖標記，並保留影片、手動或其他非 itinerary 標記。
 */
export function mergeTripItineraryPins(currentPins: MapPin[], days: TripPlanDay[]): MapPin[] {
  const preserved = currentPins.filter((pin) => pin.source !== "itinerary");
  const preservedKeys = new Set(preserved.map((pin) => pinDedupeKey(pin)));
  const itineraryPins = buildPinsFromTripPlan(days).filter((pin) => !preservedKeys.has(pinDedupeKey(pin)));
  return [...preserved, ...itineraryPins];
}

/**
 * 雙向修復行程與地圖標記：從標記補回缺少座標的行程項目，並為有座標的項目建立/連結標記。
 */
export function reconcileTripMapState(
  days: TripPlanDay[],
  currentPins: MapPin[],
): { itinerary: TripPlanDay[]; pins: MapPin[] } {
  const itinerary = days.map((day) => ({
    ...day,
    items: day.items.map((item) => ({ ...item })),
  }));
  let pins = currentPins
    .filter((pin) => hasUsableMapCoordinate(pin))
    .map((pin) => ({ ...pin }));

  for (const day of itinerary) {
    for (const item of day.items) {
      if (hasUsableMapCoordinate(item.location)) {
        continue;
      }
      const linkedPin = findLinkedPinForItem(item, pins);
      if (!linkedPin || !hasUsableMapCoordinate(linkedPin)) {
        continue;
      }
      item.location = locationFromPin(linkedPin, item);
    }
  }

  const preserved = pins.filter((pin) => pin.source !== "itinerary");
  const preservedKeys = new Set(preserved.map((pin) => pinDedupeKey(pin)));
  const nextPins: MapPin[] = [...preserved];
  const seenItineraryKeys = new Set<string>();

  for (const day of itinerary) {
    for (const item of day.items) {
      if (!item.location || !hasUsableMapCoordinate(item.location)) {
        continue;
      }

      const existingPin = pins.find((pin) => pinMatchesItem(pin, item));
      const dedupeKey = `${day.dayNumber}:${item.location.name.trim().toLowerCase()}`;
      if (seenItineraryKeys.has(dedupeKey)) {
        continue;
      }
      seenItineraryKeys.add(dedupeKey);

      if (existingPin) {
        const mergedPin: MapPin = {
          ...existingPin,
          name: item.location.name,
          lat: item.location.lat,
          lng: item.location.lng,
          description: item.notes || item.location.description || existingPin.description,
          address: item.location.address ?? existingPin.address,
          placeId: item.location.placeId ?? existingPin.placeId,
          photoUrl: item.location.photoUrl ?? existingPin.photoUrl,
          thumbnail: item.location.thumbnail ?? item.location.photoUrl ?? existingPin.thumbnail,
          openingHours: item.location.openingHours ?? existingPin.openingHours,
          phoneNumber: item.location.phoneNumber ?? existingPin.phoneNumber,
          website: item.location.website ?? existingPin.website,
          googleMapsUrl: item.location.googleMapsUrl ?? existingPin.googleMapsUrl,
          rating: item.location.rating ?? existingPin.rating,
          userRatingsTotal: item.location.userRatingsTotal ?? existingPin.userRatingsTotal,
          linkedTripItemId: item.id,
          dayNumber: day.dayNumber,
          source: existingPin.source === "video" ? existingPin.source : "itinerary",
          confidence: item.location.confidence ?? existingPin.confidence,
          verified: item.location.verified ?? existingPin.verified,
        };
        const mergedKey = pinDedupeKey(mergedPin);
        if (!preservedKeys.has(mergedKey) || existingPin.source === "itinerary") {
          const withoutDuplicate = nextPins.filter((pin) => pin.id !== existingPin.id);
          nextPins.splice(0, nextPins.length, ...withoutDuplicate, mergedPin);
        }
        continue;
      }

      const candidate = buildItineraryPin(item, day.dayNumber, nextPins.length);
      if (preservedKeys.has(pinDedupeKey(candidate))) {
        continue;
      }
      nextPins.push(candidate);
    }
  }

  pins = nextPins.filter(
    (pin, index, all) =>
      all.findIndex((entry) => entry.id === pin.id) === index &&
      all.findIndex((entry) => pinDedupeKey(entry) === pinDedupeKey(pin)) === index,
  );

  return { itinerary, pins };
}
