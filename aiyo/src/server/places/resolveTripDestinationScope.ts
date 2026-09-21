import {
  mergeTripDestinationScope,
  resolveTripDestinationScope,
  scopeFromGeocodeResult,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import { mapService } from "@/server/maps/service";

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

  const geocoded = await mapService.searchPlaces(trimmed, { limit: 1 }).catch(() => []);
  const place = geocoded[0];
  if (!place) {
    return fromCatalog;
  }

  const fromGeo = scopeFromGeocodeResult({
    query: trimmed,
    countryCode: place.metadata?.countryCode,
    lat: place.location.lat,
    lng: place.location.lng,
    formattedAddress: place.address,
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
