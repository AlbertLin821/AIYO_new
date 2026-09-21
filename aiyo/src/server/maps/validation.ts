import { MapServiceError } from "@/server/maps/errors";
import type { GeoPoint, RouteProfile } from "@/server/maps/types";

export function parsePoint(latValue: unknown, lngValue: unknown): GeoPoint {
  const lat = Number(latValue); const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new MapServiceError("MAP_GEOCODE_FAILED", "座標格式不正確。", 400);
  return { lat, lng };
}

export function parsePoints(value: unknown, max = 20): GeoPoint[] {
  if (!Array.isArray(value) || value.length < 2 || value.length > max) throw new MapServiceError("MAP_ROUTE_FAILED", `路線需要 2 到 ${max} 個座標。`, 400);
  return value.map((point) => parsePoint((point as GeoPoint)?.lat, (point as GeoPoint)?.lng));
}

export function parseProfile(value: unknown): RouteProfile {
  return value === "cycling" || value === "walking" ? value : "driving";
}

