import { fetchPlaceDetailsPatch } from "@/lib/pendingPoiLocation";
import { fetchPlaceSuggestions } from "@/lib/places/geocodeClient";
import { mapGeocodedPlaceResolvedFrom } from "@/lib/places/geocodeUtils";
import { resolvePlacePhotoUrl } from "@/lib/placePhotoUrl";
import type { LocationReference } from "@/types";
import type { GeocodeApiErrorCode, PlaceSuggestion } from "@/types/geocode";

export function resolveManualPlaceGeocodeQuery(title: string, location?: string): string {
  return location?.trim() || title.trim();
}

export function buildManualPlacePlaceholderLocation(name: string): LocationReference {
  const trimmed = name.trim();
  return {
    name: trimmed,
    lat: 0,
    lng: 0,
    description: trimmed,
    address: trimmed,
  };
}

function mergeLocationDetails(
  base: LocationReference,
  patch: Partial<LocationReference>,
): LocationReference {
  return {
    ...base,
    name: patch.name?.trim() || base.name,
    lat: patch.lat ?? base.lat,
    lng: patch.lng ?? base.lng,
    description: patch.description ?? base.description,
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
    rawQuery: base.rawQuery,
  };
}

export function locationFromPlaceSuggestion(
  suggestion: PlaceSuggestion,
  preferredName?: string,
): LocationReference {
  const name = preferredName?.trim() || suggestion.placeName;
  const photoUrl = resolvePlacePhotoUrl(suggestion.photoUrl, suggestion.placeId);
  const thumbnail = resolvePlacePhotoUrl(
    suggestion.thumbnail ?? suggestion.photoUrl,
    suggestion.placeId,
  );
  return {
    name,
    lat: suggestion.lat,
    lng: suggestion.lng,
    description: suggestion.formattedAddress || name,
    address: suggestion.formattedAddress || undefined,
    placeId: suggestion.placeId || undefined,
    photoUrl,
    thumbnail,
    openingHours: suggestion.openingHours,
    phoneNumber: suggestion.phoneNumber,
    website: suggestion.website,
    googleMapsUrl: suggestion.googleMapsUrl,
    rating: suggestion.rating,
    userRatingsTotal: suggestion.userRatingsTotal,
    resolvedFrom: mapGeocodedPlaceResolvedFrom(suggestion.provider),
    rawQuery: suggestion.sourceQuery || preferredName || suggestion.placeName,
    verified: true,
    confidence: suggestion.confidence,
  };
}

export function buildItineraryFieldsFromResolvedLocation(
  location: LocationReference,
  fallbackQuery: string,
): { title: string; location: LocationReference } {
  const resolvedName = location.name.trim() || fallbackQuery.trim();
  return {
    title: resolvedName,
    location: {
      ...location,
      name: resolvedName,
      address: location.address || location.description || fallbackQuery.trim(),
      description: location.description || location.address || resolvedName,
    },
  };
}

function locationNeedsPhotoEnrichment(location: LocationReference): boolean {
  return Boolean(location.placeId?.trim()) && !location.photoUrl && !location.thumbnail;
}

export async function finalizeManualPlaceLocation(
  suggestion: PlaceSuggestion,
  preferredName: string | undefined,
  destinationHint?: string,
): Promise<LocationReference> {
  const base = locationFromPlaceSuggestion(suggestion, preferredName);
  if (!locationNeedsPhotoEnrichment(base)) {
    return base;
  }
  try {
    const patch = await fetchPlaceDetailsPatch(
      {
        placeId: base.placeId!,
        lat: base.lat,
        lng: base.lng,
      },
      destinationHint,
    );
    return mergeLocationDetails(base, patch);
  } catch {
    return base;
  }
}

export type ManualPlaceFailureReason =
  | "query_too_short"
  | "not_found"
  | "missing_api_key"
  | "provider_error"
  | "unauthorized"
  | "invalid_request";

function mapSuggestErrorCode(code: string): ManualPlaceFailureReason {
  if (code === "missing_api_key") {
    return "missing_api_key";
  }
  if (code === "unauthorized") {
    return "unauthorized";
  }
  if (code === "not_found") {
    return "not_found";
  }
  if (code === "invalid_request") {
    return "invalid_request";
  }
  return "provider_error";
}

export type ManualPlaceResolution =
  | { status: "auto"; location: LocationReference }
  | { status: "choose"; query: string; suggestions: PlaceSuggestion[] }
  | { status: "failed"; reason: ManualPlaceFailureReason; message?: string };

export async function resolveManualPlaceLocation(
  query: string,
  destinationHint?: string,
): Promise<ManualPlaceResolution> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { status: "failed", reason: "query_too_short" };
  }

  const result = await fetchPlaceSuggestions({
    query: trimmed,
    destinationHint: destinationHint?.trim() || undefined,
  });

  if (!result.ok) {
    return {
      status: "failed",
      reason: mapSuggestErrorCode(result.code),
      message: result.message,
    };
  }

  if (result.suggestions.length === 0) {
    return { status: "failed", reason: "not_found" };
  }

  if (result.autoResolve) {
    const location = await finalizeManualPlaceLocation(
      result.autoResolve,
      result.autoResolve.placeName,
      destinationHint,
    );
    return { status: "auto", location };
  }

  return {
    status: "choose",
    query: trimmed,
    suggestions: result.suggestions,
  };
}

export function manualPlaceFailureReasonFromCode(
  code: GeocodeApiErrorCode | string,
): ManualPlaceFailureReason {
  return mapSuggestErrorCode(code);
}
