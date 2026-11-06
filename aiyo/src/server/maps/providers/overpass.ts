import { buildNearbyOverpassQuery } from "@/server/maps/categories";
import { MapServiceError } from "@/server/maps/errors";
import type { GeoPoint, MapPoi, MapPoiCategory, NearbyPoiOptions } from "@/server/maps/types";

type Element = { type?: string; id?: number; lat?: number; lon?: number; center?: { lat?: number; lon?: number }; tags?: Record<string, string> };
const PLACEHOLDER_NAMES = new Set(["various", "unknown", "unnamed", "no name"]);

function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const rad = Math.PI / 180;
  const deltaLat = (b.lat - a.lat) * rad;
  const deltaLng = (b.lng - a.lng) * rad;
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(deltaLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(h));
}

export function normalizeOverpassElement(row: Element, category: MapPoiCategory): MapPoi | null {
  const lat = Number(row.lat ?? row.center?.lat);
  const lng = Number(row.lon ?? row.center?.lon);
  const name = (row.tags?.["name:zh-Hant"] || row.tags?.["name:zh"] || row.tags?.name || row.tags?.brand || "").trim();
  if (!name || PLACEHOLDER_NAMES.has(name.toLowerCase()) || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
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
    return (body.elements || [])
      .map((row) => normalizeOverpassElement(row, options.category))
      .filter((poi): poi is MapPoi => poi !== null && distanceMeters(point, poi.location) <= radius)
      .sort((a, b) => distanceMeters(point, a.location) - distanceMeters(point, b.location))
      .slice(0, limit);
  } catch {
    throw new MapServiceError("MAP_NEARBY_FAILED", "附近地點服務暫時無法使用。");
  }
}

export async function overpassNamed(baseUrl: string, name: string, limit = 8): Promise<MapPoi[]> {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) return [];
  const escaped = trimmed.replace(/[\\"\n\r]/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const query = `[out:json][timeout:12];(nwr["name"~"^${escaped}$",i];nwr["name:zh"~"^${escaped}$",i];nwr["name:zh-Hant"~"^${escaped}$",i];nwr["name:ja"~"^${escaped}$",i];nwr["name:ko"~"^${escaped}$",i];);out center ${Math.min(20, Math.max(1, limit))};`;
  try {
    const response = await fetch(baseUrl, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", "User-Agent": "AIYO/1.0" }, body: new URLSearchParams({ data: query }), signal: AbortSignal.timeout(14000) });
    if (!response.ok) throw new Error(String(response.status));
    const payload = await response.json() as { elements?: Element[] };
    return (payload.elements || []).flatMap((row): MapPoi[] => {
      const lat = Number(row.lat ?? row.center?.lat);
      const lng = Number(row.lon ?? row.center?.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
      const label = row.tags?.["name:zh-Hant"] || row.tags?.["name:zh"] || row.tags?.name || trimmed;
      return [{ id: `overpass:${row.type || "node"}:${row.id}`, externalId: `${row.type || "node"}:${row.id}`, source: "overpass", name: label, location: { lat, lng }, address: [row.tags?.["addr:street"], row.tags?.["addr:city"]].filter(Boolean).join(" ") || undefined,
        metadata: { openingHours: row.tags?.opening_hours, phone: row.tags?.phone, website: row.tags?.website } }];
    }).slice(0, limit);
  } catch { return []; }
}

