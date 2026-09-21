import { MapServiceError } from "@/server/maps/errors";
import type { GeoPoint, MapPoi, MapPoiCategory, SearchPlaceOptions } from "@/server/maps/types";

type PhotonFeature = {
  geometry?: { coordinates?: unknown[] };
  properties?: Record<string, unknown>;
};
type PhotonResponse = { features?: PhotonFeature[] };

let consecutiveFailures = 0;
let circuitOpenUntil = 0;

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

const PHOTON_CATEGORIES: Record<string, MapPoiCategory> = {
  "amenity:restaurant": "restaurant",
  "amenity:cafe": "cafe",
  "tourism:hotel": "hotel",
  "tourism:attraction": "attraction",
  "tourism:museum": "museum",
  "leisure:park": "park",
  "shop:convenience": "convenience",
  "amenity:parking": "parking",
  "railway:station": "station",
};

export function normalizePhotonFeature(feature: PhotonFeature): MapPoi | null {
  const coordinates = feature.geometry?.coordinates;
  const p = feature.properties || {};
  const lng = Number(coordinates?.[0]);
  const lat = Number(coordinates?.[1]);
  const name =
    text(p.name) || text(p.street) || text(p.city) || text(p.country);
  if (
    !name ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  )
    return null;
  const osmType = text(p.osm_type) || "node";
  const osmId = text(p.osm_id) || String(p.osm_id ?? `${lat},${lng}`);
  const address = [
    p.street,
    p.housenumber,
    p.district,
    p.city,
    p.state,
    p.country,
  ]
    .map(text)
    .filter(Boolean)
    .join(", ");
  return {
    id: `photon:${osmType}:${osmId}`,
    name,
    location: { lat, lng },
    address: address || undefined,
    category: PHOTON_CATEGORIES[`${text(p.osm_key)}:${text(p.osm_value)}`],
    source: "photon",
    externalId: `${osmType}:${osmId}`,
    metadata: { countryCode: text(p.countrycode)?.toUpperCase() },
  };
}

async function photonJson(url: URL, timeoutMs = 5000): Promise<PhotonResponse> {
  if (Date.now() < circuitOpenUntil) {
    throw new MapServiceError(
      "MAP_SEARCH_FAILED",
      "地點搜尋服務暫時無法使用。",
    );
  }
  try {
    const requestOptions = {
      headers: {
        Accept: "application/geo+json, application/json",
        "User-Agent": "AIYO/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    };
    let response = await fetch(url, requestOptions);
    if (response.status === 400 && url.searchParams.has("lang")) {
      const error = await response.clone().json().catch(() => null);
      if (Array.isArray(error?.lang) && error.lang.some((item: { message?: string }) =>
        item.message?.includes("Language is not supported"))) {
        const fallbackUrl = new URL(url);
        fallbackUrl.searchParams.delete("lang");
        response = await fetch(fallbackUrl, requestOptions);
      }
    }
    if (!response.ok) throw new Error(String(response.status));
    const payload = (await response.json()) as PhotonResponse;
    consecutiveFailures = 0;
    circuitOpenUntil = 0;
    return payload;
  } catch {
    consecutiveFailures += 1;
    if (consecutiveFailures >= 3) circuitOpenUntil = Date.now() + 30_000;
    throw new MapServiceError(
      "MAP_SEARCH_FAILED",
      "地點搜尋服務暫時無法使用。",
    );
  }
}

export async function photonSearch(
  baseUrl: string,
  query: string,
  options: SearchPlaceOptions = {},
): Promise<MapPoi[]> {
  const url = new URL(`${baseUrl}/api`);
  url.searchParams.set("q", query);
  url.searchParams.set(
    "limit",
    String(Math.min(10, Math.max(1, options.limit ?? 6))),
  );
  url.searchParams.set("lang", options.language || "zh");
  if (options.near) {
    url.searchParams.set("lat", String(options.near.lat));
    url.searchParams.set("lon", String(options.near.lng));
  }
  if (options.bbox) url.searchParams.set("bbox", options.bbox.join(","));
  const body = await photonJson(url);
  return (body.features || [])
    .map(normalizePhotonFeature)
    .filter((poi): poi is MapPoi => Boolean(poi));
}

export async function photonReverse(
  baseUrl: string,
  point: GeoPoint,
  language = "zh",
): Promise<MapPoi | null> {
  const url = new URL(`${baseUrl}/reverse`);
  url.searchParams.set("lat", String(point.lat));
  url.searchParams.set("lon", String(point.lng));
  url.searchParams.set("lang", language);
  try {
    const body = await photonJson(url);
    return (
      (body.features || []).map(normalizePhotonFeature).find(Boolean) || null
    );
  } catch {
    throw new MapServiceError(
      "MAP_GEOCODE_FAILED",
      "反向地理編碼服務暫時無法使用。",
    );
  }
}
