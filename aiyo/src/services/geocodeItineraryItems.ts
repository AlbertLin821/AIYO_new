import { fetchPlaceDetailsPatch } from "@/lib/pendingPoiLocation";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { fetchGeocodedPlace, fetchPlaceSuggestions } from "@/lib/places/geocodeClient";
import { mapGeocodedPlaceResolvedFrom } from "@/lib/places/geocodeUtils";
import { hasUsablePlacePhotoUrl } from "@/lib/placePhotoUrl";
import type { LocationReference, TripPlanDay, TripPlanItem } from "@/types";
import type { GeocodedPlace, PlaceSuggestion } from "@/types/geocode";

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

function locationFromSuggestion(
  suggestion: PlaceSuggestion,
  preferredName?: string,
): LocationReference {
  const name = preferredName?.trim() || suggestion.placeName;
  return {
    name,
    lat: suggestion.lat,
    lng: suggestion.lng,
    description: suggestion.formattedAddress || name,
    address: suggestion.formattedAddress || undefined,
    placeId: suggestion.placeId || undefined,
    photoUrl: suggestion.photoUrl || undefined,
    thumbnail: suggestion.thumbnail || suggestion.photoUrl || undefined,
    openingHours: suggestion.openingHours || undefined,
    phoneNumber: suggestion.phoneNumber || undefined,
    website: suggestion.website || undefined,
    googleMapsUrl: suggestion.googleMapsUrl || undefined,
    rating: suggestion.rating,
    userRatingsTotal: suggestion.userRatingsTotal,
    resolvedFrom: mapGeocodedPlaceResolvedFrom(suggestion.provider),
    rawQuery: suggestion.sourceQuery || preferredName || suggestion.placeName,
    verified: true,
    confidence: suggestion.confidence,
  };
}

function comparableQuery(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function queryVariants(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const variants = new Set<string>([trimmed]);
  const withoutBrackets = trimmed.replace(/[（(][^）)]*[）)]/gu, " ").replace(/\s+/g, " ").trim();
  if (withoutBrackets) {
    variants.add(withoutBrackets);
  }

  const pipeHead = withoutBrackets.split(/[｜|]/u)[0]?.trim();
  if (pipeHead) {
    variants.add(pipeHead);
  }

  const dashHead = pipeHead?.split(/\s*[-–—]\s*/u)[0]?.trim();
  if (dashHead) {
    variants.add(dashHead);
  }

  const keywordTrimmed = dashHead?.replace(
    /\s+(?:人氣|必吃|美食|合菜|團體|特色料理|家庭聚餐|包廂餐廳推薦|生日慶生|花火節|聚餐|約會|打卡).*$|(?:人氣|必吃|美食|合菜|團體|特色料理|家庭聚餐|包廂餐廳推薦|生日慶生|花火節|聚餐|約會|打卡).*$/u,
    "",
  ).trim();
  if (keywordTrimmed) {
    variants.add(keywordTrimmed);
  }

  if (/[\p{Script=Han}]/u.test(keywordTrimmed || dashHead || trimmed)) {
    const firstWord = (keywordTrimmed || dashHead || trimmed).split(/\s+/u)[0]?.trim();
    if (firstWord && firstWord.length >= 2) {
      variants.add(firstWord);
    }
  }

  return [...variants].filter((value, index, all) => value.length >= 2 && all.indexOf(value) === index);
}

function selectSuggestionFallback(
  suggestions: PlaceSuggestion[],
  originalQuery: string,
): PlaceSuggestion | null {
  const top = suggestions[0];
  if (!top?.placeId) {
    return null;
  }

  const topScore = top.confidence ?? 0;
  const runnerScore = suggestions[1]?.confidence ?? 0;
  const topComparable = comparableQuery(`${top.placeName} ${top.formattedAddress || ""}`);
  const queryComparable = comparableQuery(originalQuery);
  const matchesQuery =
    queryComparable.length >= 2 &&
    (topComparable.includes(queryComparable) || queryComparable.includes(comparableQuery(top.placeName)));

  if (!matchesQuery) {
    return null;
  }

  if (topScore >= 0.72) {
    return top;
  }
  if (topScore >= 0.66 && (suggestions.length === 1 || topScore - runnerScore >= 0.08)) {
    return top;
  }
  return null;
}

export async function geocodeQuery(
  query: string,
  region?: string,
): Promise<LocationReference | null> {
  const variants = queryVariants(query);
  if (variants.length === 0) {
    return null;
  }

  const destinationHint = region?.trim() || undefined;

  for (const variant of variants) {
    const result = await fetchGeocodedPlace({
      query: variant,
      destinationHint,
      purpose: "itinerary_item",
    });
    if (result.ok) {
      return locationFromGeocoded(result.place, query.trim());
    }
  }

  for (const variant of variants) {
    const suggestions = await fetchPlaceSuggestions({
      query: variant,
      destinationHint,
      maxResults: 5,
    });
    if (!suggestions.ok) {
      continue;
    }
    const chosen = suggestions.autoResolve || selectSuggestionFallback(suggestions.suggestions, variant);
    if (chosen) {
      return locationFromSuggestion(chosen, query.trim());
    }
  }

  return null;
}

export function resolveLocationGeocodeQuery(item: TripPlanItem): string {
  const notesLocation = item.notes?.match(/地點：(.+)/)?.[1]?.trim();
  return item.location?.name?.trim() || item.location?.address?.trim() || notesLocation || "";
}

export function resolveGeocodeQueryForItem(item: TripPlanItem): string {
  return resolveLocationGeocodeQuery(item) || item.title.trim();
}

export function collectItineraryItemsMissingLocation(
  days: TripPlanDay[],
): Array<{ dayNumber: number; item: TripPlanItem }> {
  return days.flatMap((day) =>
    day.items
      .filter((item) => !hasUsableMapCoordinate(item.location))
      .map((item) => ({ dayNumber: day.dayNumber, item })),
  );
}

export function applyLocationUpdatesToItinerary(
  days: TripPlanDay[],
  updates: Array<{ dayNumber: number; itemId: string; location: LocationReference }>,
): TripPlanDay[] {
  if (updates.length === 0) {
    return days;
  }

  return days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      const update = updates.find(
        (entry) => entry.dayNumber === day.dayNumber && entry.itemId === item.id,
      );
      return update ? { ...item, location: update.location } : item;
    }),
  }));
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

function mergeLocationDetails(
  base: LocationReference,
  patch: Partial<LocationReference>,
): LocationReference {
  return {
    ...base,
    lat: patch.lat ?? base.lat,
    lng: patch.lng ?? base.lng,
    description: base.description || patch.description || base.name,
    address: patch.address ?? base.address,
    placeId: patch.placeId ?? base.placeId,
    photoUrl: patch.photoUrl ?? base.photoUrl,
    thumbnail: patch.thumbnail ?? patch.photoUrl ?? base.thumbnail ?? base.photoUrl,
    openingHours: patch.openingHours ?? base.openingHours,
    phoneNumber: patch.phoneNumber ?? base.phoneNumber,
    website: patch.website ?? base.website,
    googleMapsUrl: patch.googleMapsUrl ?? base.googleMapsUrl,
    rating: patch.rating ?? base.rating,
    userRatingsTotal: patch.userRatingsTotal ?? base.userRatingsTotal,
    resolvedFrom: patch.resolvedFrom ?? base.resolvedFrom,
    verified: patch.verified ?? base.verified,
    confidence: patch.confidence ?? base.confidence,
  };
}

function locationNeedsPhotoEnrichment(location: LocationReference): boolean {
  const placeId = location.placeId?.trim();
  if (!placeId || !hasUsableMapCoordinate(location)) {
    return false;
  }

  return !hasUsablePlacePhotoUrl(location.photoUrl, placeId)
    && !hasUsablePlacePhotoUrl(location.thumbnail, placeId);
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
    return mergeLocationDetails(location, patch);
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

export function collectItineraryItemsMissingPlacePhotos(
  days: TripPlanDay[],
): Array<{ dayNumber: number; item: TripPlanItem }> {
  return days.flatMap((day) =>
    day.items
      .filter((item) => item.location && locationNeedsPhotoEnrichment(item.location))
      .map((item) => ({ dayNumber: day.dayNumber, item })),
  );
}

export async function enrichItineraryItemsMissingPlacePhotos(
  items: Array<{ dayNumber: number; item: TripPlanItem }>,
  region?: string,
): Promise<Array<{ dayNumber: number; itemId: string; location: LocationReference }>> {
  const updates: Array<{ dayNumber: number; itemId: string; location: LocationReference }> = [];

  for (const entry of items) {
    const location = entry.item.location;
    if (!location || !locationNeedsPhotoEnrichment(location)) {
      continue;
    }

    try {
      const patch = await fetchPlaceDetailsPatch(
        {
          placeId: location.placeId!.trim(),
          lat: location.lat,
          lng: location.lng,
        },
        region,
      );
      if (!patch.photoUrl && !patch.thumbnail) {
        continue;
      }
      updates.push({
        dayNumber: entry.dayNumber,
        itemId: entry.item.id,
        location: mergeLocationDetails(location, patch),
      });
    } catch {
      continue;
    }
  }

  return updates;
}
