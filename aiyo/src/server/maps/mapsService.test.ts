import assert from "node:assert/strict";
import test from "node:test";
import { buildNearbyOverpassQuery, isMapPoiCategory } from "@/server/maps/categories";
import { MapMemoryCache, normalizedMapCacheKey } from "@/server/maps/cache";
import { normalizePhotonFeature } from "@/server/maps/providers/photon";
import { normalizeOverpassElement } from "@/server/maps/providers/overpass";
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
