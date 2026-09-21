import { mapMemoryCache, normalizedMapCacheKey } from "@/server/maps/cache";
import { mapServiceConfig } from "@/server/maps/config";
import { photonReverse, photonSearch } from "@/server/maps/providers/photon";
import { overpassNearby } from "@/server/maps/providers/overpass";
import { osrmMatrix, osrmRoute } from "@/server/maps/providers/osrm";
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

async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = mapMemoryCache.get<T>(key);
  if (hit !== null) return hit;
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

export const mapService = {
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
      photonSearch(mapServiceConfig.photonBaseUrl, normalized, {
        ...options,
        language: options.language || mapServiceConfig.defaultLanguage,
      }),
    );
  },
  reverseGeocode(point: GeoPoint, language?: string): Promise<MapPoi | null> {
    const key = normalizedMapCacheKey("reverse", [pointKey(point), language]);
    return cached(key, mapServiceConfig.searchCacheTtlMs, () =>
      photonReverse(
        mapServiceConfig.photonBaseUrl,
        point,
        language || mapServiceConfig.defaultLanguage,
      ),
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
      overpassNearby(mapServiceConfig.overpassBaseUrl, point, {
        ...options,
        radius,
      }),
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
      osrmRoute(mapServiceConfig.osrmBaseUrl, points, profile),
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
      osrmMatrix(mapServiceConfig.osrmBaseUrl, points, profile),
    );
  },
};
