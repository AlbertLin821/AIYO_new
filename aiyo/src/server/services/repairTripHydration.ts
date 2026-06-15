import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { hasUsablePlacePhotoUrl } from "@/lib/placePhotoUrl";
import { mapGeocodedPlaceResolvedFrom } from "@/lib/places/geocodeUtils";
import { applyLocationUpdatesToItinerary, collectItineraryItemsMissingLocation, resolveGeocodeQueryForItem } from "@/services/geocodeItineraryItems";
import { hydrateItineraryTransportFields } from "@/services/itineraryTransport";
import { reconcileTripMapState } from "@/services/mapSync";
import { fetchGooglePlaceDetailsByPlaceId } from "@/server/geo/geocodeService";
import { geocodePlace, suggestPlacesForQuery } from "@/server/places/geocodePlace";
import type { LocationReference, PersistedTripPayload } from "@/types";
import type { GeocodedPlace, PlaceSuggestion } from "@/types/geocode";

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

async function enrichLocationDetails(location: LocationReference): Promise<LocationReference> {
  const placeId = location.placeId?.trim();
  if (!placeId) {
    return location;
  }

  const needsDetails =
    !hasUsablePlacePhotoUrl(location.photoUrl, placeId) ||
    !hasUsablePlacePhotoUrl(location.thumbnail, placeId) ||
    !location.googleMapsUrl ||
    !location.address;
  if (!needsDetails) {
    return location;
  }

  const details = await fetchGooglePlaceDetailsByPlaceId(placeId);
  if (!details || Object.keys(details).length === 0) {
    return location;
  }

  return {
    ...location,
    lat: details.lat ?? location.lat,
    lng: details.lng ?? location.lng,
    address: details.address ?? location.address,
    description: details.description ?? location.description,
    photoUrl: details.photoUrl ?? location.photoUrl,
    thumbnail: details.thumbnail ?? details.photoUrl ?? location.thumbnail ?? location.photoUrl,
    openingHours: details.openingHours ?? location.openingHours,
    phoneNumber: details.phoneNumber ?? location.phoneNumber,
    website: details.website ?? location.website,
    googleMapsUrl: details.googleMapsUrl ?? location.googleMapsUrl,
    rating: details.rating ?? location.rating,
    userRatingsTotal: details.userRatingsTotal ?? location.userRatingsTotal,
    verified: details.verified ?? location.verified,
  };
}

async function locationFromGeocoded(place: GeocodedPlace, preferredName?: string): Promise<LocationReference> {
  const name = preferredName?.trim() || place.placeName;
  const base: LocationReference = {
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
  return enrichLocationDetails(base);
}

async function locationFromSuggestion(
  suggestion: PlaceSuggestion,
  preferredName?: string,
): Promise<LocationReference> {
  const name = preferredName?.trim() || suggestion.placeName;
  const base: LocationReference = {
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
  return enrichLocationDetails(base);
}

async function geocodeLocationQuery(
  query: string,
  destination: string,
): Promise<LocationReference | null> {
  const variants = queryVariants(query);
  if (variants.length === 0) {
    return null;
  }

  for (const variant of variants) {
    const result = await geocodePlace({
      query: variant,
      destinationHint: destination || undefined,
    });
    if (result.ok) {
      return locationFromGeocoded(result.place, query.trim());
    }
  }

  for (const variant of variants) {
    const suggestions = await suggestPlacesForQuery(
      {
        query: variant,
        destinationHint: destination || undefined,
      },
      { maxResults: 5 },
    );
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

async function hydrateMissingLocations(
  payload: PersistedTripPayload,
): Promise<PersistedTripPayload> {
  const missingItems = collectItineraryItemsMissingLocation(payload.itinerary);
  if (missingItems.length === 0) {
    return payload;
  }

  const updates: Array<{ dayNumber: number; itemId: string; location: LocationReference }> = [];
  for (const entry of missingItems) {
    const query = resolveGeocodeQueryForItem(entry.item);
    const location = query ? await geocodeLocationQuery(query, payload.destination) : null;
    if (location) {
      updates.push({ dayNumber: entry.dayNumber, itemId: entry.item.id, location });
    }
  }

  if (updates.length === 0) {
    return payload;
  }

  return {
    ...payload,
    itinerary: applyLocationUpdatesToItinerary(payload.itinerary, updates),
  };
}

async function hydrateMissingPlaceDetails(
  payload: PersistedTripPayload,
): Promise<PersistedTripPayload> {
  let changed = false;
  const itinerary = await Promise.all(
    payload.itinerary.map(async (day) => ({
      ...day,
      items: await Promise.all(
        day.items.map(async (item) => {
          if (!item.location?.placeId || !hasUsableMapCoordinate(item.location)) {
            return item;
          }
          const nextLocation = await enrichLocationDetails(item.location);
          if (JSON.stringify(nextLocation) !== JSON.stringify(item.location)) {
            changed = true;
            return { ...item, location: nextLocation };
          }
          return item;
        }),
      ),
    })),
  );

  if (!changed) {
    return payload;
  }

  return { ...payload, itinerary };
}

export async function repairTripHydration(
  payload: PersistedTripPayload,
  options?: { preferredTransport?: string | null },
): Promise<{ changed: boolean; trip: PersistedTripPayload }> {
  const originalKey = JSON.stringify({
    itinerary: payload.itinerary,
    pins: payload.pins,
  });

  let next = await hydrateMissingLocations(payload);
  next = await hydrateMissingPlaceDetails(next);

  const hydratedTransport = hydrateItineraryTransportFields(next.itinerary, {
    destination: next.destination,
    preferredTransport: options?.preferredTransport,
  });
  next = {
    ...next,
    itinerary: hydratedTransport,
  };

  const reconciled = reconcileTripMapState(next.itinerary, next.pins);
  next = {
    ...next,
    itinerary: reconciled.itinerary,
    pins: reconciled.pins,
  };

  const nextKey = JSON.stringify({
    itinerary: next.itinerary,
    pins: next.pins,
  });

  return {
    changed: originalKey !== nextKey,
    trip: next,
  };
}
