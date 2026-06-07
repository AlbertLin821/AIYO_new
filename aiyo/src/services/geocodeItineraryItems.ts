import { fetchPlaceDetailsPatch } from "@/lib/pendingPoiLocation";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { fetchGeocodedPlace } from "@/lib/places/geocodeClient";
import { mapGeocodedPlaceResolvedFrom } from "@/lib/places/geocodeUtils";
import { hasUsablePlacePhotoUrl } from "@/lib/placePhotoUrl";
import type { LocationReference, TripPlanItem } from "@/types";
import type { GeocodedPlace } from "@/types/geocode";

function locationFromGeocoded(place: GeocodedPlace, preferredName?: string): LocationReference {
  const name = preferredName?.trim() || place.placeName;
  return {
    name,
    lat: place.lat,
    lng: place.lng,
    description: place.formattedAddress || name,
    address: place.formattedAddress || undefined,
    placeId: place.placeId || undefined,
    resolvedFrom: mapGeocodedPlaceResolvedFrom(place.provider),
    rawQuery: place.sourceQuery || preferredName || place.placeName,
    verified: true,
    confidence: place.confidence,
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

  const result = await fetchGeocodedPlace({
    query: trimmed,
    destinationHint: region?.trim() || undefined,
    purpose: "itinerary_item",
  });
  if (!result.ok) {
    return null;
  }

  return locationFromGeocoded(result.place, trimmed);
}

export function resolveLocationGeocodeQuery(item: TripPlanItem): string {
  const notesLocation = item.notes?.match(/地點：(.+)/)?.[1]?.trim();
  return item.location?.name?.trim() || item.location?.address?.trim() || notesLocation || "";
}

export function resolveGeocodeQueryForItem(item: TripPlanItem): string {
  return resolveLocationGeocodeQuery(item) || item.title.trim();
}

function mergeGeocodedLocation(
  item: TripPlanItem,
  locationQuery: string,
  geocoded: LocationReference,
): LocationReference {
  const preferredName = item.location?.name?.trim();
  if (preferredName && preferredName === locationQuery) {
    return {
      ...geocoded,
      name: preferredName,
      address: geocoded.address || item.location?.address || preferredName,
      description: geocoded.description || item.location?.description || preferredName,
    };
  }
  return geocoded;
}

async function enrichGeocodedLocationPhotos(
  location: LocationReference,
  region?: string,
): Promise<LocationReference> {
  const placeId = location.placeId?.trim();
  if (!placeId || !hasUsableMapCoordinate(location)) {
    return location;
  }

  const photoUsable = hasUsablePlacePhotoUrl(location.photoUrl, placeId)
    || hasUsablePlacePhotoUrl(location.thumbnail, placeId);
  if (photoUsable) {
    return location;
  }

  try {
    const patch = await fetchPlaceDetailsPatch(
      { placeId, lat: location.lat, lng: location.lng },
      region,
    );
    if (!patch.photoUrl && !patch.thumbnail) {
      return location;
    }
    return {
      ...location,
      ...patch,
      photoUrl: patch.photoUrl ?? location.photoUrl,
      thumbnail: patch.thumbnail ?? patch.photoUrl ?? location.thumbnail ?? location.photoUrl,
    };
  } catch {
    return location;
  }
}

/** Fill missing coordinates on itinerary items (e.g. after manual add or AI patch). */
export async function geocodeItineraryItemsMissingLocation(
  items: Array<{ dayNumber: number; item: TripPlanItem }>,
  region?: string,
): Promise<Array<{ dayNumber: number; itemId: string; location: LocationReference }>> {
  const updates: Array<{ dayNumber: number; itemId: string; location: LocationReference }> = [];
  for (const entry of items) {
    if (hasUsableMapCoordinate(entry.item.location)) {
      continue;
    }

    const locationQuery = resolveLocationGeocodeQuery(entry.item);
    let location = locationQuery ? await geocodeQuery(locationQuery, region) : null;
    if (location) {
      location = mergeGeocodedLocation(entry.item, locationQuery, location);
    } else {
      const titleQuery = entry.item.title.trim();
      if (titleQuery && titleQuery !== locationQuery) {
        location = await geocodeQuery(titleQuery, region);
      }
    }

    if (location) {
      location = await enrichGeocodedLocationPhotos(location, region);
      updates.push({ dayNumber: entry.dayNumber, itemId: entry.item.id, location });
    }
  }
  return updates;
}
