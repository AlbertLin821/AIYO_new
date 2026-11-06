import assert from "node:assert/strict";
import test from "node:test";
import { mapMemoryCache } from "@/server/maps/cache";
import { mapServiceConfig } from "@/server/maps/config";
import { searchPlacesByText } from "./osmPlacesSearchService";

test("local Overpass exact name precedes a misleading Photon partial match", async () => {
  const originalFetch = globalThis.fetch;
  const originalEndpoint = mapServiceConfig.regionalOverpass.JP;
  mapServiceConfig.regionalOverpass.JP = "http://local-overpass/api/interpreter";
  mapMemoryCache.clear();
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    if (String(input).includes("local-overpass")) {
      return new Response(JSON.stringify({ elements: [{ type: "way", id: 123, center: { lat: 35.7148, lon: 139.7967 }, tags: { name: "浅草寺", "name:zh-Hant": "淺草寺" } }] }), { status: 200 });
    }
    return new Response(JSON.stringify({ features: [{ geometry: { coordinates: [139.793, 35.714] }, properties: { name: "淺草 rockza", osm_type: "node", osm_id: "1" } }] }), { status: 200 });
  }) as typeof fetch;
  try {
    const result = await searchPlacesByText("淺草寺", "東京", { maxResults: 5 });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.places[0]?.name, "淺草寺");
      assert.equal(result.places[0]?.countryCode, "JP");
      assert.equal(result.places[0]?.placeId, "way:123");
    }
  } finally {
    globalThis.fetch = originalFetch;
    mapServiceConfig.regionalOverpass.JP = originalEndpoint;
    mapMemoryCache.clear();
  }
});
