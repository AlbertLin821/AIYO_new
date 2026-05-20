import type { MapPin, TripPlanDay, TripPlanItem } from "@/types";

function normalizePlaceText(value: string | undefined): string {
  return (value || "").trim().toLowerCase();
}

/** Match an itinerary item to its map pin (same rules as the itinerary side panel). */
export function findLinkedPinForItem(item: TripPlanItem, pins: MapPin[]): MapPin | undefined {
  const location = item.location;
  const normalizedLocationName = normalizePlaceText(location?.name);
  const normalizedTitle = normalizePlaceText(item.title);
  return pins.find((pin) => {
    if (pin.linkedTripItemId === item.id) {
      return true;
    }
    if (location?.placeId && pin.placeId && location.placeId === pin.placeId) {
      return true;
    }
    if (
      location &&
      Math.abs(pin.lat - location.lat) < 0.00001 &&
      Math.abs(pin.lng - location.lng) < 0.00001
    ) {
      return true;
    }
    const normalizedPinName = normalizePlaceText(pin.name);
    return Boolean(
      normalizedPinName &&
        (normalizedPinName === normalizedLocationName || normalizedPinName === normalizedTitle),
    );
  });
}

/**
 * Global stop order (1…n) for pins that appear in itinerary day/item order.
 * Each pin id is numbered at first linked item only.
 */
export function buildPinStopOrderByPinId(itinerary: TripPlanDay[], pins: MapPin[]): Map<string, number> {
  const usedPinIds = new Set<string>();
  let n = 0;
  const out = new Map<string, number>();
  for (const day of itinerary) {
    for (const item of day.items) {
      const pin = findLinkedPinForItem(item, pins);
      if (!pin || usedPinIds.has(pin.id)) {
        continue;
      }
      n += 1;
      out.set(pin.id, n);
      usedPinIds.add(pin.id);
    }
  }
  return out;
}
