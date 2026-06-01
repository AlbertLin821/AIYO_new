import {
  mergeTripDestinationScope,
  resolveTripDestinationScope,
  scopeFromGeocodeResult,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import { geocodeWithGoogle } from "@/server/geo/geocodeService";

export async function resolveTripDestinationScopeWithGeocode(
  destination?: string | null,
): Promise<TripDestinationScope | null> {
  const trimmed = destination?.trim();
  if (!trimmed) {
    return null;
  }

  const fromCatalog = resolveTripDestinationScope(trimmed);
  if (fromCatalog?.countryCodes.length) {
    return fromCatalog;
  }

  const geocoded = await geocodeWithGoogle(trimmed);
  if (!geocoded.ok) {
    return fromCatalog;
  }

  const fromGeo = scopeFromGeocodeResult({
    query: trimmed,
    countryCode: geocoded.result.countryCode,
    lat: geocoded.result.lat,
    lng: geocoded.result.lng,
    formattedAddress: geocoded.result.formattedAddress,
  });

  if (!fromGeo) {
    return fromCatalog;
  }

  return mergeTripDestinationScope(fromCatalog, {
    ...fromGeo,
    canonicalLabel: fromCatalog?.canonicalLabel || fromGeo.canonicalLabel,
    source: "geocode",
  });
}
