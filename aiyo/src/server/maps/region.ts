import type { GeoPoint } from "@/server/maps/types";
import { regionPolygons } from "./geofabrikRegions";

export type SupportedMapRegion = "TW" | "JP" | "KR";

function containsPoint(polygon: ReadonlyArray<readonly [number, number]>, point: GeoPoint): boolean {
  const { lat, lng } = point;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [x1, y1] = polygon[previous];
    const [x2, y2] = polygon[index];
    const cross = (lng - x1) * (y2 - y1) - (lat - y1) * (x2 - x1);
    if (Math.abs(cross) < 1e-9 && lng >= Math.min(x1, x2) && lng <= Math.max(x1, x2) && lat >= Math.min(y1, y2) && lat <= Math.max(y1, y2)) return true;
    if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside;
  }
  return inside;
}

export function mapRegionForPoint(point: GeoPoint): SupportedMapRegion | null {
  if (!Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return null;
  for (const region of ["TW", "KR", "JP"] as const) {
    if (containsPoint(regionPolygons[region], point)) return region;
  }
  return null;
}

export function sharedMapRegion(points: GeoPoint[]): SupportedMapRegion | null {
  if (!points.length) return null;
  const region = mapRegionForPoint(points[0]!);
  return region && points.every((point) => mapRegionForPoint(point) === region) ? region : null;
}
