import { buildNearbyOverpassQuery } from "@/server/maps/categories";
import { MapServiceError } from "@/server/maps/errors";
import type { GeoPoint, MapPoi, MapPoiCategory, NearbyPoiOptions } from "@/server/maps/types";

type Element = { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };

export function normalizeOverpassElement(row: Element, category: MapPoiCategory): MapPoi | null {
  const lat = Number(row.lat ?? row.center?.lat);
  const lng = Number(row.lon ?? row.center?.lon);
  const name = row.tags?.["name:zh-Hant"] || row.tags?.["name:zh"] || row.tags?.name || row.tags?.brand;
  if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const type = row.type || "node";
  const externalId = `${type}:${row.id ?? `${lat},${lng}`}`;
  const address = [row.tags?.["addr:housenumber"], row.tags?.["addr:street"], row.tags?.["addr:city"]].filter(Boolean).join(" ");
  return { id: `overpass:${externalId}`, externalId, source: "overpass", name, location: { lat, lng }, address: address || undefined, category, metadata: { phone: row.tags?.phone, website: row.tags?.website, openingHours: row.tags?.opening_hours, cuisine: row.tags?.cuisine } };
}

export async function overpassNearby(baseUrl: string, point: GeoPoint, options: NearbyPoiOptions): Promise<MapPoi[]> {
  const radius = Math.min(5000, Math.max(100, Math.round(options.radius ?? 1000)));
  const limit = Math.min(50, Math.max(1, Math.round(options.limit ?? 20)));
  try {
    const response = await fetch(baseUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "AIYO/1.0" }, body: new URLSearchParams({ data: buildNearbyOverpassQuery(options.category, point.lat, point.lng, radius) }), signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(String(response.status));
    const body = await response.json() as { elements?: Element[] };
    return (body.elements || []).map((row) => normalizeOverpassElement(row, options.category)).filter((poi): poi is MapPoi => Boolean(poi)).slice(0, limit);
  } catch {
    throw new MapServiceError("MAP_NEARBY_FAILED", "附近地點服務暫時無法使用。");
  }
}

