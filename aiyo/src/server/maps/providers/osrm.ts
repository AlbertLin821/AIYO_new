import { MapServiceError } from "@/server/maps/errors";
import type { GeoPoint, MapDistanceMatrix, MapRoute, RouteProfile } from "@/server/maps/types";

function coordinates(points: GeoPoint[]): string { return points.map((p) => `${p.lng},${p.lat}`).join(";"); }
function osrmProfile(profile: RouteProfile): string { return profile === "driving" ? "driving" : profile === "cycling" ? "bike" : "foot"; }

export function normalizeOsrmRoute(body: unknown): MapRoute | null {
  const route = (body as { routes?: Array<{ distance?: number; duration?: number; geometry?: { type?: string; coordinates?: unknown[] } }> }).routes?.[0];
  if (!route || route.geometry?.type !== "LineString" || !Array.isArray(route.geometry.coordinates)) return null;
  const coords = route.geometry.coordinates.filter((p): p is [number, number] => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]));
  if (coords.length < 2) return null;
  return { distanceMeters: Math.max(0, Number(route.distance) || 0), durationSeconds: Math.max(0, Number(route.duration) || 0), geometry: { type: "LineString", coordinates: coords } };
}

export async function osrmRoute(baseUrl: string, points: GeoPoint[], profile: RouteProfile): Promise<MapRoute> {
  const url = new URL(`${baseUrl}/route/v1/${osrmProfile(profile)}/${coordinates(points)}`);
  url.searchParams.set("overview", "full"); url.searchParams.set("geometries", "geojson"); url.searchParams.set("steps", "false");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "AIYO/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(String(response.status));
    const normalized = normalizeOsrmRoute(await response.json());
    if (!normalized) throw new Error("NoRoute");
    return normalized;
  } catch { throw new MapServiceError("MAP_ROUTE_FAILED", "路線服務暫時無法使用。"); }
}

export async function osrmMatrix(baseUrl: string, points: GeoPoint[], profile: RouteProfile): Promise<MapDistanceMatrix> {
  const url = new URL(`${baseUrl}/table/v1/${osrmProfile(profile)}/${coordinates(points)}`);
  url.searchParams.set("annotations", "distance,duration");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "AIYO/1.0" }, signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json() as { distances?: Array<Array<number | null>>; durations?: Array<Array<number | null>> };
    return { distancesMeters: body.distances || [], durationsSeconds: body.durations || [] };
  } catch { throw new MapServiceError("MAP_ROUTE_FAILED", "距離矩陣服務暫時無法使用。"); }
}

