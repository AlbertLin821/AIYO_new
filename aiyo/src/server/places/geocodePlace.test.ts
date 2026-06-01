import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import {
  clearGeocodeMemoryCacheForTests,
  geocodeLanguageForScope,
  geocodePlace,
} from "@/server/places/geocodePlace";
import { resolveTripDestinationScope } from "@/lib/tripDestinationScope";

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

test("geocodeLanguageForScope uses ja for Japan trips", () => {
  const scope = resolveTripDestinationScope("東京");
  assert.equal(geocodeLanguageForScope(scope), "ja");
});

test("geocodePlace sends country component and language on geocode request", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  let geocodeUrl = "";
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/geocode/json")) {
      geocodeUrl = url;
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "浅草, 台東区, 東京都, 日本",
              place_id: "place-asakusa",
              types: ["neighborhood", "political"],
              geometry: { location: { lat: 35.7147, lng: 139.7967 } },
              address_components: [{ short_name: "JP", types: ["country", "political"] }],
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ status: "ZERO_RESULTS", results: [] }), { status: 200 });
  };

  await geocodePlace({ query: "淺草", destinationHint: "東京" });
  assert.ok(geocodeUrl.includes("language=ja"));
  assert.ok(geocodeUrl.includes("components=country%3AJP"));
});

test("geocodePlace accepts cross-locale match when scope passes and placeId present", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: "2 Chome-3-1 Asakusa, Taito City, Tokyo 111-0032, Japan",
            place_id: "place-sensoji",
            types: ["tourist_attraction", "place_of_worship", "point_of_interest", "establishment"],
            geometry: { location: { lat: 35.7148, lng: 139.7967 } },
            address_components: [{ short_name: "JP", types: ["country", "political"] }],
          },
        ],
      }),
      { status: 200 },
    );

  const result = await geocodePlace({ query: "淺草寺", destinationHint: "東京" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.place.lat, 35.7148);
    assert.equal(result.place.placeId, "place-sensoji");
  }
});

test("geocodePlace falls back to Places text search when geocode gate fails", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input.url;
    if (url.includes("/geocode/json")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "New York, NY, USA",
              place_id: "place-nyc-wrong",
              types: ["locality", "political"],
              geometry: { location: { lat: 40.7128, lng: -74.006 } },
              address_components: [{ short_name: "US", types: ["country", "political"] }],
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/place/textsearch/json")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              name: "淺草寺",
              formatted_address: "2 Chome-3-1 Asakusa, Taito City, Tokyo, Japan",
              place_id: "place-text-sensoji",
              types: ["tourist_attraction", "place_of_worship", "point_of_interest"],
              geometry: { location: { lat: 35.7148, lng: 139.7967 } },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/place/details/json")) {
      return new Response(JSON.stringify({ status: "OK", result: {} }), { status: 200 });
    }
    return new Response(JSON.stringify({ status: "ZERO_RESULTS" }), { status: 200 });
  };

  const result = await geocodePlace({ query: "淺草寺", destinationHint: "東京" });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.place.provider, "google-places");
    assert.equal(result.place.placeId, "place-text-sensoji");
  }
});
