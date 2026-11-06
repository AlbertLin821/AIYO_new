import assert from "node:assert/strict";
import test from "node:test";
import { buildNearbyOverpassQuery, isMapPoiCategory } from "@/server/maps/categories";
import { MapMemoryCache, mapMemoryCache, normalizedMapCacheKey } from "@/server/maps/cache";
import { mapServiceConfig } from "@/server/maps/config";
import { mapService } from "@/server/maps/service";
import { normalizePhotonFeature } from "@/server/maps/providers/photon";
import { normalizeOverpassElement, overpassNearby } from "@/server/maps/providers/overpass";
import { normalizeOsrmRoute } from "@/server/maps/providers/osrm";
import { parsePoint, parsePoints } from "@/server/maps/validation";

test("normalizes Photon GeoJSON without leaking provider schema", () => {
  const poi = normalizePhotonFeature({ geometry: { coordinates: [121.5645, 25.033] }, properties: { osm_type: "W", osm_id: 123, name: "台北101", city: "臺北市", country: "台灣" } });
  assert.deepEqual(poi?.location, { lat: 25.033, lng: 121.5645 });
  assert.equal(poi?.id, "photon:W:123");
  assert.equal(poi?.name, "台北101");
});

test("normalizes Overpass way center and semantic metadata", () => {
  const poi = normalizeOverpassElement({ type: "way", id: 9, center: { lat: 25, lon: 121 }, tags: { name: "測試咖啡", phone: "123", cuisine: "coffee_shop" } }, "cafe");
  assert.equal(poi?.id, "overpass:way:9");
  assert.equal(poi?.metadata?.cuisine, "coffee_shop");
});

test("category mapping is allowlisted and produces bounded static QL", () => {
  assert.equal(isMapPoiCategory("restaurant"), true);
  assert.equal(isMapPoiCategory("restaurant\"] ; out;"), false);
  const query = buildNearbyOverpassQuery("park", 25.03, 121.56, 1000);
  assert.match(query, /leisure.*park/);
  assert.doesNotMatch(query, /undefined/);
});

test("normalizes OSRM GeoJSON route", () => {
  const route = normalizeOsrmRoute({ routes: [{ distance: 1200, duration: 300, geometry: { type: "LineString", coordinates: [[121, 25], [121.1, 25.1]] } }] });
  assert.equal(route?.distanceMeters, 1200);
  assert.equal(route?.durationSeconds, 300);
});

test("nearby POIs exclude placeholder names and out-of-radius centers, then sort by distance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify({ elements: [
    { type: "node", id: 1, lat: 25.04, lon: 121.56, tags: { name: "較遠餐廳" } },
    { type: "node", id: 2, lat: 25.0301, lon: 121.56, tags: { name: "較近餐廳" } },
    { type: "node", id: 3, lat: 25.03, lon: 121.56, tags: { name: "various" } },
    { type: "way", id: 4, center: { lat: 25.1, lon: 121.56 }, tags: { name: "範圍外餐廳" } },
  ] }), { status: 200 })) as typeof fetch;
  try {
    const results = await overpassNearby("http://local-overpass/api/interpreter", { lat: 25.03, lng: 121.56 }, { category: "restaurant", radius: 1500 });
    assert.deepEqual(results.map((poi) => poi.name), ["較近餐廳", "較遠餐廳"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cache normalizes keys, expires and bounds entries", () => {
  let now = 10; const cache = new MapMemoryCache(1, () => now);
  cache.set("a", 1, 10); assert.equal(cache.get<number>("a"), 1);
  now = 21; assert.equal(cache.get("a"), null);
  assert.equal(normalizedMapCacheKey("search", [" 台北101 ", "ZH-TW"]), "search:台北101:zh-tw");
  cache.set("a", 1, 10); cache.set("b", 2, 10); assert.equal(cache.get("a"), null);
});

test("coordinate validation rejects invalid values and route counts", () => {
  assert.deepEqual(parsePoint(25, 121), { lat: 25, lng: 121 });
  assert.throws(() => parsePoint(91, 121));
  assert.throws(() => parsePoints([{ lat: 25, lng: 121 }]));
});

test("regional POI outage falls back to public endpoint only when enabled", async () => {
  const oldFetch = globalThis.fetch;
  const oldEndpoint = mapServiceConfig.regionalOverpass.TW;
  const oldFallback = mapServiceConfig.allowPublicFallback;
  mapServiceConfig.regionalOverpass.TW = "http://local-overpass/api/interpreter";
  mapServiceConfig.allowPublicFallback = true;
  mapMemoryCache.clear();
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("local-overpass")) return new Response("unavailable", { status: 503 });
    return new Response(JSON.stringify({ elements: [{ type: "node", id: 1, lat: 25.03, lon: 121.56, tags: { name: "餐廳" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const rows = await mapService.searchNearbyPoi({ lat: 25.03, lng: 121.56 }, { category: "restaurant", radius: 1000 });
    assert.equal(rows.length, 1);
    assert.equal(urls.length, 2);
    assert.match(urls[1]!, /overpass-api\.de/);
  } finally {
    globalThis.fetch = oldFetch;
    mapServiceConfig.regionalOverpass.TW = oldEndpoint;
    mapServiceConfig.allowPublicFallback = oldFallback;
    mapMemoryCache.clear();
  }
});
