import type { LocationReference, MapPin, TripPlanDay } from "@/types";

const PIN_COLORS = [
  "#F4A7B9",
  "#7C9CBF",
  "#B8D8BA",
  "#C3B1E1",
  "#FFDAB9",
  "#FFB347",
  "#87CEEB",
];

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
      if (!item.location) {
        continue;
      }
      const dedupeKey = `${day.dayNumber}:${item.location.name}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      pins.push({
        id: `day_${day.dayNumber}_${item.id}`,
        name: item.location.name,
        lat: item.location.lat,
        lng: item.location.lng,
        description: item.notes || item.location.description,
        address: item.location.address,
        dayNumber: day.dayNumber,
        linkedTripItemId: item.id,
        color: PIN_COLORS[pins.length % PIN_COLORS.length],
        source: "itinerary",
        confidence: item.location.confidence,
        verified: item.location.verified,
      });
    }
  }

  return pins;
}

/**
 * 以目前行程重建「行程」來源的地圖標記，並保留影片、手動或其他非 itinerary 標記。
 */
export function mergeTripItineraryPins(currentPins: MapPin[], days: TripPlanDay[]): MapPin[] {
  const preserved = currentPins.filter((pin) => pin.source !== "itinerary");
  const itineraryPins = buildPinsFromTripPlan(days);
  return [...preserved, ...itineraryPins];
}
