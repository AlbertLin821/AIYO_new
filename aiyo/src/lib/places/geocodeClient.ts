import type { ApiResponse, ApiSuccess } from "@/types";
import type {
  GeocodedPlace,
  PlacesGeocodeRequest,
  PlacesSuggestData,
  PlacesSuggestRequest,
} from "@/types/geocode";

type GeocodeApiData = { place: GeocodedPlace };

function placesApiEndpoint(path: "geocode" | "suggest"): string {
  if (typeof window !== "undefined") {
    return `/api/places/${path}`;
  }
  return `http://127.0.0.1/api/places/${path}`;
}

export async function fetchGeocodedPlace(
  request: PlacesGeocodeRequest,
): Promise<
  | { ok: true; place: GeocodedPlace }
  | { ok: false; code: string; message: string }
> {
  const response = await fetch(placesApiEndpoint("geocode"), {
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

export async function fetchPlaceSuggestions(
  request: PlacesSuggestRequest,
): Promise<
  | { ok: true; suggestions: PlacesSuggestData["suggestions"]; autoResolve: PlacesSuggestData["autoResolve"] }
  | { ok: false; code: string; message: string }
> {
  const response = await fetch(placesApiEndpoint("suggest"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  const payload = (await response.json()) as ApiResponse<PlacesSuggestData>;

  if (!payload.success) {
    return {
      ok: false,
      code: payload.error.code || "provider_error",
      message: payload.error.message || "地點建議查詢失敗。",
    };
  }

  const success = payload as ApiSuccess<PlacesSuggestData>;
  return {
    ok: true,
    suggestions: success.data.suggestions,
    autoResolve: success.data.autoResolve,
  };
}
