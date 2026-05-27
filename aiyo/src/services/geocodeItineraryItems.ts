import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import type { ApiResponse, GeocodeResponse, LocationReference, TripPlanItem } from "@/types";

function geocodeResultToLocation(query: string, result: GeocodeResponse["results"][number]): LocationReference {
  return {
    name: result.query || query,
    lat: result.lat,
    lng: result.lng,
    description: result.formattedAddress,
    address: result.formattedAddress,
    placeId: result.placeId,
    photoUrl: result.photoUrl,
    thumbnail: result.thumbnail || result.photoUrl,
    openingHours: result.openingHours,
    phoneNumber: result.phoneNumber,
    website: result.website,
    googleMapsUrl: result.googleMapsUrl,
    rating: result.rating,
    userRatingsTotal: result.userRatingsTotal,
    resolvedFrom: "google-geocode",
    rawQuery: query,
    verified: true,
  };
}

export async function geocodeQuery(
  query: string,
  region?: string,
): Promise<LocationReference | null> {
  const trimmed = query.trim();
  if (!trimmed) {
    return null;
  }
  const response = await fetch("/api/map/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      queries: [trimmed],
      region: region?.trim() || undefined,
    }),
  });
  const payload = (await response.json()) as ApiResponse<GeocodeResponse>;
  if (!payload.success) {
    return null;
  }
  const result = payload.data.results[0];
  if (!result) {
    return null;
  }
  return geocodeResultToLocation(trimmed, result);
}

export function resolveGeocodeQueryForItem(item: TripPlanItem): string {
  const notesLocation = item.notes?.match(/地點：(.+)/)?.[1]?.trim();
  return item.location?.name?.trim() || notesLocation || item.title.trim();
}

/** Fill missing coordinates on itinerary items (e.g. after AI patch adds). */
export async function geocodeItineraryItemsMissingLocation(
  items: Array<{ dayNumber: number; item: TripPlanItem }>,
  region?: string,
): Promise<Array<{ dayNumber: number; itemId: string; location: LocationReference }>> {
  const updates: Array<{ dayNumber: number; itemId: string; location: LocationReference }> = [];
  for (const entry of items) {
    if (hasUsableMapCoordinate(entry.item.location)) {
      continue;
    }
    const query = resolveGeocodeQueryForItem(entry.item);
    const location = await geocodeQuery(query, region);
    if (location) {
      updates.push({ dayNumber: entry.dayNumber, itemId: entry.item.id, location });
    }
  }
  return updates;
}
