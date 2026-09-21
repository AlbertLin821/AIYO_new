import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { clearGeocodeMemoryCacheForTests, geocodeLanguageForScope, geocodePlace } from "@/server/places/geocodePlace";
import { mapMemoryCache } from "@/server/maps/cache";
import { resolveTripDestinationScope } from "@/lib/tripDestinationScope";

const originalFetch = globalThis.fetch;
function photonResponse(features: unknown[]) { return new Response(JSON.stringify({ type: "FeatureCollection", features }), { status: 200 }); }
function photonFeature(name: string, lng: number, lat: number, country = "Japan", countrycode = "JP") { return { type: "Feature", geometry: { type: "Point", coordinates: [lng, lat] }, properties: { osm_type: "W", osm_id: 123, name, country, countrycode, city: "Tokyo", street: "Asakusa" } }; }

beforeEach(() => { clearGeocodeMemoryCacheForTests(); mapMemoryCache.clear(); });
afterEach(() => { globalThis.fetch = originalFetch; });

test("geocodePlace rejects empty query", async () => { const result = await geocodePlace({ query: " " }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "invalid_request"); });

test("geocodePlace rejects a same-country result that does not match the requested place", async () => {
  globalThis.fetch = async () => photonResponse([photonFeature("台南高鐵站", 120.2864, 22.9246, "Taiwan", "TW")]);
  const result = await geocodePlace({ query: "國華街", destinationHint: "台南" });
  assert.equal(result.ok, false);
});

test("geocodePlace retries the place name when destination-appended search has no results", async () => {
  const queries: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const query = url.searchParams.get("q") || "";
    queries.push(query);
    return photonResponse(query === "淺草寺" ? [photonFeature("淺草寺", 139.7967, 35.7148)] : []);
  };
  const result = await geocodePlace({ query: "淺草寺", destinationHint: "東京" });
  assert.equal(result.ok, true);
  assert.deepEqual(queries, ["淺草寺 東京", "淺草寺"]);
});

test("geocodePlace does not require a Google API key", async () => { delete process.env.GOOGLE_MAPS_API_KEY; globalThis.fetch = async () => photonResponse([photonFeature("淺草寺", 139.7967, 35.7148)]); const result = await geocodePlace({ query: "淺草寺", destinationHint: "東京" }); assert.equal(result.ok, true); });

test("geocodePlace maps Photon result to GeocodedPlace", async () => { globalThis.fetch = async () => photonResponse([photonFeature("淺草寺", 139.7967, 35.7148)]); const result = await geocodePlace({ query: "淺草寺", destinationHint: "東京" }); assert.equal(result.ok, true); if (result.ok) { assert.equal(result.place.provider, "photon"); assert.equal(result.place.lat, 35.7148); assert.equal(result.place.placeId, "W:123"); } });

test("geocodePlace rejects country outside trip destination scope", async () => { globalThis.fetch = async () => photonResponse([photonFeature("Central Park", -73.9654, 40.7829, "United States", "US")]); const result = await geocodePlace({ query: "Central Park", destinationHint: "東京" }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "not_found"); });

test("geocodePlace returns not_found for empty Photon results", async () => { globalThis.fetch = async () => photonResponse([]); const result = await geocodePlace({ query: "不存在地點", destinationHint: "東京" }); assert.equal(result.ok, false); if (!result.ok) assert.equal(result.code, "not_found"); });

test("geocodePlace sends language and destination bias to Photon", async () => { let requestedUrl = ""; globalThis.fetch = async (input) => { requestedUrl = input instanceof Request ? input.url : String(input); return photonResponse([photonFeature("淺草寺", 139.7967, 35.7148)]); }; await geocodePlace({ query: "淺草寺", destinationHint: "東京" }); const url = new URL(requestedUrl); assert.equal(url.searchParams.get("lang"), "zh"); assert.equal(url.searchParams.get("q"), "淺草寺 東京"); });

test("geocodeLanguageForScope retains locale selection for downstream display", () => { assert.equal(geocodeLanguageForScope(resolveTripDestinationScope("日本東京")), "ja"); });
