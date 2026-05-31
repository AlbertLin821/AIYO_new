import type { ApiResponse, ApiSuccess } from "@/types";
import type { GeocodedPlace, PlacesGeocodeRequest } from "@/types/geocode";

type GeocodeApiData = { place: GeocodedPlace };

function geocodeEndpoint(): string {
  if (typeof window !== "undefined") {
    return "/api/places/geocode";
  }
  return "http://127.0.0.1/api/places/geocode";
}

export async function fetchGeocodedPlace(
  request: PlacesGeocodeRequest,
): Promise<
  | { ok: true; place: GeocodedPlace }
  | { ok: false; code: string; message: string }
> {
  const response = await fetch(geocodeEndpoint(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as ApiResponse<GeocodeApiData>;

  if (!payload.success) {
    return {
      ok: false,
      code: payload.error.code || "provider_error",
      message: payload.error.message || "地理編碼失敗。",
    };
  }

  const success = payload as ApiSuccess<GeocodeApiData>;
  return { ok: true, place: success.data.place };
}
