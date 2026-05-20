import { serverConfig } from "@/server/config";
import { fetchGooglePlaceDetailsByPlaceId } from "@/server/geo/geocodeService";
import { isUsableMapCoordinate } from "@/lib/geoCoordinates";

export type PlaceSearchHit = {
  name: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId: string;
  types: string[];
  rating?: number;
  userRatingsTotal?: number;
  openingHours?: string;
  phoneNumber?: string;
  website?: string;
  googleMapsUrl?: string;
  photoUrl?: string;
};

type GoogleTextSearchResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    name?: string;
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    place_id?: string;
    types?: string[];
    rating?: number;
    user_ratings_total?: number;
  }>;
};

function regionFromHint(locationHint?: string): string | undefined {
  if (!locationHint?.trim()) {
    return "tw";
  }
  const h = locationHint.trim().toLowerCase();
  if (/japan|tokyo|osaka|kyoto|日本|東京|大阪|京都/.test(h)) {
    return "jp";
  }
  if (/korea|seoul|busan|韓國|首爾|釜山/.test(h)) {
    return "kr";
  }
  if (/taiwan|台灣|臺灣|chiayi|kaohsiung|taipei|taichung|tainan|嘉義|高雄|台北|臺北|台中|台南/.test(h)) {
    return "tw";
  }
  return undefined;
}

function buildTextQuery(query: string, locationHint?: string): string {
  const q = query.trim();
  const hint = locationHint?.trim();
  if (!hint) {
    return q;
  }
  if (q.toLowerCase().includes(hint.toLowerCase())) {
    return q;
  }
  return `${q} ${hint}`;
}

export async function searchPlacesByText(
  query: string,
  locationHint?: string,
  options?: { maxResults?: number },
): Promise<{ ok: true; places: PlaceSearchHit[] } | { ok: false; reason: string }> {
  const maxResults = Math.min(12, Math.max(1, options?.maxResults ?? 8));
  const key = serverConfig.googleMapsApiKey;

  if (serverConfig.enableMockMaps) {
    return {
      ok: true,
      places: [
        {
          name: "示範餐廳（Mock）",
          formattedAddress: "示範地址",
          lat: 23.48,
          lng: 120.44,
          placeId: "mock_place_search",
          types: ["restaurant", "food", "point_of_interest"],
          rating: 4.2,
          userRatingsTotal: 120,
          openingHours: "週一至週日 11:00–21:00",
        },
      ],
    };
  }

  if (!key) {
    return { ok: false, reason: "GOOGLE_MAPS_API_KEY is not configured." };
  }

  const textQuery = buildTextQuery(query, locationHint);
  const params = new URLSearchParams({
    query: textQuery,
    key,
    language: "zh-TW",
  });
  const region = regionFromHint(locationHint);
  if (region) {
    params.set("region", region);
  }

  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Place text search failed.";
    return { ok: false, reason: message };
  }

  const payload = (await response.json()) as GoogleTextSearchResponse;
  if (!response.ok || payload.status === "REQUEST_DENIED") {
    return {
      ok: false,
      reason: payload.error_message || `Place text search HTTP ${response.status} (${payload.status}).`,
    };
  }
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") {
    return {
      ok: false,
      reason: payload.error_message || `Place text search status ${payload.status}.`,
    };
  }

  const raw = payload.results || [];
  const sliced = raw.slice(0, maxResults);

  const enriched = await Promise.all(
    sliced.map(async (row) => {
      const placeId = row.place_id || "";
      const loc = row.geometry?.location;
      const lat = loc?.lat;
      const lng = loc?.lng;
      if (lat == null || lng == null || !isUsableMapCoordinate(lat, lng)) {
        return null;
      }
      const base: PlaceSearchHit = {
        name: row.name || textQuery,
        formattedAddress: row.formatted_address || "",
        lat,
        lng,
        placeId: placeId || `noid_${lat}_${lng}`,
        types: row.types || [],
        rating: row.rating,
        userRatingsTotal: row.user_ratings_total,
      };
      if (!placeId) {
        return base;
      }
      const details = await fetchGooglePlaceDetailsByPlaceId(placeId);
      return {
        ...base,
        openingHours: details.openingHours,
        phoneNumber: details.phoneNumber,
        website: details.website,
        googleMapsUrl: details.googleMapsUrl,
        photoUrl: details.photoUrl ?? details.thumbnail,
        rating: details.rating ?? base.rating,
        userRatingsTotal: details.userRatingsTotal ?? base.userRatingsTotal,
      };
    }),
  );

  return { ok: true, places: enriched.filter((p): p is PlaceSearchHit => Boolean(p)) };
}
