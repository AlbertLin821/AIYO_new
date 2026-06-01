import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { clearGeocodeMemoryCacheForTests, geocodePlace } from "@/server/places/geocodePlace";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;

beforeEach(() => {
  clearGeocodeMemoryCacheForTests();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_MAPS_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

test("geocodePlace rejects empty query", async () => {
  const result = await geocodePlace({ query: " " });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "invalid_request");
  }
});

test("geocodePlace returns missing_api_key when key absent", async () => {
  delete process.env.GOOGLE_MAPS_API_KEY;
  const result = await geocodePlace({ query: "Tokyo Skytree" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "missing_api_key");
  }
});

test("geocodePlace maps provider result to GeocodedPlace", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: "1 Chome Oshiage, Sumida City, Tokyo, Japan",
            place_id: "place-skytree",
            types: ["tourist_attraction", "point_of_interest", "establishment"],
            geometry: { location: { lat: 35.7101, lng: 139.8107 } },
          },
        ],
      }),
      { status: 200 },
    );

  const result = await geocodePlace({ query: "Tokyo Skytree", destinationHint: "Tokyo" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.place.lat, 35.7101);
    assert.equal(result.place.placeId, "place-skytree");
    assert.equal(result.place.provider, "google-geocoding");
    assert.ok(!JSON.stringify(result.place).includes("test-key"));
  }
});

test("geocodePlace rejects country outside trip destination scope", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: "New York, NY, USA",
            place_id: "place-nyc",
            types: ["locality", "political"],
            geometry: { location: { lat: 40.7128, lng: -74.006 } },
            address_components: [
              { short_name: "US", types: ["country", "political"] },
            ],
          },
        ],
      }),
      { status: 200 },
    );

  const result = await geocodePlace({
    query: "Statue of Liberty",
    destinationHint: "日本",
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "not_found");
  }
});

test("geocodePlace returns not_found for zero results", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });

  const result = await geocodePlace({ query: "Nowhere Place XYZ" });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.code, "not_found");
  }
});
