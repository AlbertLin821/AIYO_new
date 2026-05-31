import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearTripDestinationScopeCacheForTests } from "@/lib/tripDestinationScope";
import { resolveTripDestinationScopeWithGeocode } from "@/server/places/resolveTripDestinationScope";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;

afterEach(() => {
  clearTripDestinationScopeCacheForTests();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_MAPS_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

test("resolveTripDestinationScopeWithGeocode uses catalog when destination is known", async () => {
  const scope = await resolveTripDestinationScopeWithGeocode("日本");
  assert.ok(scope);
  assert.deepEqual(scope?.countryCodes, ["JP"]);
  assert.equal(scope?.source, "catalog");
});

test("resolveTripDestinationScopeWithGeocode geocodes unknown destination labels", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: "Alpine Valley Retreat X9, Hokkaido, Japan",
            place_id: "place-hokkaido",
            types: ["administrative_area_level_1", "political"],
            geometry: { location: { lat: 43.2203, lng: 142.8635 } },
            address_components: [{ short_name: "JP", types: ["country", "political"] }],
          },
        ],
      }),
      { status: 200 },
    );

  const scope = await resolveTripDestinationScopeWithGeocode("Alpine Valley Retreat X9");
  assert.ok(scope);
  assert.deepEqual(scope?.countryCodes, ["JP"]);
  assert.equal(scope?.source, "geocode");
});
