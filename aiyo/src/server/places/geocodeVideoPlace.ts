import {
  geocodeResultFailsDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import {
  geocodePlace,
  type GeocodePlaceResult,
} from "@/server/places/geocodePlace";
function passesVideoGeocodeScope(
  result: GeocodePlaceResult,
  placeName: string,
  scope: TripDestinationScope | null | undefined,
): boolean {
  if (!result.ok) {
    return false;
  }
  return (
    geocodeResultFailsDestinationScope(
      {
        countryCode: result.place.countryCode,
        lat: result.place.lat,
        lng: result.place.lng,
        formattedAddress: result.place.formattedAddress,
        placeName,
      },
      scope,
    ) === null
  );
}

/**
 * Geocode a video-extracted POI with scope-aware retries (raw name, then enriched with region label).
 */
export async function geocodeVideoPlaceName(input: {
  query: string;
  destinationHint?: string;
  destinationScope?: TripDestinationScope | null;
}): Promise<GeocodePlaceResult> {
  const placeName = input.query.trim();
  if (placeName.length < 2) {
    return { ok: false, code: "invalid_request", message: "地點名稱過短。" };
  }

  const scope = input.destinationScope ?? null;
  const hint = input.destinationHint?.trim() || scope?.canonicalLabel?.trim();

  const attempts: Array<{ query: string; destinationHint?: string }> = [{ query: placeName, destinationHint: hint }];
  const regionLabel = scope?.canonicalLabel?.trim();
  if (regionLabel && !placeName.includes(regionLabel)) {
    attempts.push({
      query: `${placeName}, ${regionLabel}`,
      destinationHint: regionLabel,
    });
  }

  let lastResult: GeocodePlaceResult = {
    ok: false,
    code: "not_found",
    message: "找不到符合的地點。",
  };

  for (const attempt of attempts) {
    const result = await geocodePlace({
      query: attempt.query,
      destinationHint: attempt.destinationHint,
      destinationScope: scope,
    });
    lastResult = result;
    if (result.ok && passesVideoGeocodeScope(result, placeName, scope)) {
      return result;
    }
  }

  return lastResult;
}
