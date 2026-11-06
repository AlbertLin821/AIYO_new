import { mapMemoryCache, normalizedMapCacheKey } from "@/server/maps/cache";
import { mapServiceConfig } from "@/server/maps/config";
import { photonReverse, photonSearch } from "@/server/maps/providers/photon";
import { overpassNamed, overpassNearby } from "@/server/maps/providers/overpass";
import { osrmMatrix, osrmRoute } from "@/server/maps/providers/osrm";
import { mapRegionForPoint, sharedMapRegion } from "@/server/maps/region";
import type {
  GeoPoint,
  MapPoi,
  MapRoute,
  MapDistanceMatrix,
  NearbyPoiOptions,
  RouteProfile,
  SearchPlaceOptions,
} from "@/server/maps/types";

function pointKey(point: GeoPoint): string {
  return `${point.lat.toFixed(5)},${point.lng.toFixed(5)}`;
}

function stampPlaces(places: MapPoi[]): MapPoi[] {
  const checkedAt = new Date().toISOString();
  return places.map((place) => ({ ...place, checkedAt }));
}

async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = mapMemoryCache.get<T>(key);
  if (hit !== null) {
    console.info("[maps]", { operation: key.split(":")[0], durationMs: 0, status: "ok", cacheHit: true });
    return hit;
  }
  const startedAt = Date.now();
  try {
    const value = await load();
    mapMemoryCache.set(key, value, ttl);
    console.info("[maps]", {
      operation: key.split(":")[0],
      durationMs: Date.now() - startedAt,
      status: "ok",
      cacheHit: false,
    });
    return value;
  } catch (error) {
    console.warn("[maps]", {
      operation: key.split(":")[0],
      durationMs: Date.now() - startedAt,
      status: "failed",
      cacheHit: false,
      error: error instanceof Error ? error.name : "unknown",
    });
    throw error;
  }
}

async function regionalWithFallback<T>(label: string, primary: string, fallback: string, run: (baseUrl: string) => Promise<T>): Promise<T> {
  try { return await run(primary); }
  catch (error) {
    if (!mapServiceConfig.allowPublicFallback || primary === fallback) throw error;
    console.warn("[maps] public_fallback", { operation: label, from: new URL(primary).host });
    return run(fallback);
  }
}

export const mapService = {
  searchExactNamedPlace(query: string, region: "TW" | "JP" | "KR"): Promise<MapPoi[]> {
    const endpoint = mapServiceConfig.regionalOverpass[region];
    if (!endpoint) return Promise.resolve([]);
    return cached(normalizedMapCacheKey("exact-name", [query, region]), 60_000, async () => stampPlaces(await overpassNamed(endpoint, query, 8)));
  },
  searchPlaces(
    query: string,
    options: SearchPlaceOptions = {},
  ): Promise<MapPoi[]> {
    const normalized = query.trim();
    const key = normalizedMapCacheKey("search", [
      normalized,
      options.language,
      options.near ? pointKey(options.near) : "",
      options.limit,
    ]);
    return cached(key, mapServiceConfig.searchCacheTtlMs, () =>
      regionalWithFallback("search", mapServiceConfig.photonBaseUrl, "https://photon.komoot.io", async (baseUrl) => stampPlaces(await photonSearch(baseUrl, normalized, {
        ...options,
        language: options.language || mapServiceConfig.defaultLanguage,
      }))),
    );
  },
  reverseGeocode(point: GeoPoint, language?: string): Promise<MapPoi | null> {
    const key = normalizedMapCacheKey("reverse", [pointKey(point), language]);
    return cached(key, mapServiceConfig.searchCacheTtlMs, () =>
      regionalWithFallback("reverse", mapServiceConfig.photonBaseUrl, "https://photon.komoot.io", async (baseUrl) => {
        const place = await photonReverse(
        baseUrl,
        point,
        language || mapServiceConfig.defaultLanguage,
        );
        return place ? stampPlaces([place])[0] : null;
      }),
    );
  },
  searchNearbyPoi(
    point: GeoPoint,
    options: NearbyPoiOptions,
  ): Promise<MapPoi[]> {
    const radius = Math.min(
      5000,
      Math.max(100, Math.round(options.radius ?? 1000)),
    );
    const key = normalizedMapCacheKey("nearby", [
      pointKey(point),
      options.category,
      radius,
      options.limit,
    ]);
    return cached(key, mapServiceConfig.nearbyCacheTtlMs, () =>
      regionalWithFallback("nearby", (mapRegionForPoint(point) && mapServiceConfig.regionalOverpass[mapRegionForPoint(point)!]) || mapServiceConfig.overpassBaseUrl, mapServiceConfig.overpassBaseUrl, async (baseUrl) => stampPlaces(await overpassNearby(baseUrl, point, {
        ...options,
        radius,
      }))),
    );
  },
  getRoute(
    points: GeoPoint[],
    profile: RouteProfile = "driving",
  ): Promise<MapRoute> {
    const key = normalizedMapCacheKey("route", [
      profile,
      ...points.map(pointKey),
    ]);
    return cached(key, mapServiceConfig.routeCacheTtlMs, () =>
      regionalWithFallback("route", (sharedMapRegion(points) && mapServiceConfig.regionalOsrm[sharedMapRegion(points)!]) || mapServiceConfig.osrmBaseUrl, mapServiceConfig.osrmBaseUrl, (baseUrl) => osrmRoute(baseUrl, points, profile)),
    );
  },
  getDistanceMatrix(
    points: GeoPoint[],
    profile: RouteProfile = "driving",
  ): Promise<MapDistanceMatrix> {
    const key = normalizedMapCacheKey("matrix", [
      profile,
      ...points.map(pointKey),
    ]);
    return cached(key, mapServiceConfig.routeCacheTtlMs, () =>
      regionalWithFallback("matrix", (sharedMapRegion(points) && mapServiceConfig.regionalOsrm[sharedMapRegion(points)!]) || mapServiceConfig.osrmBaseUrl, mapServiceConfig.osrmBaseUrl, (baseUrl) => osrmMatrix(baseUrl, points, profile)),
    );
  },
};
