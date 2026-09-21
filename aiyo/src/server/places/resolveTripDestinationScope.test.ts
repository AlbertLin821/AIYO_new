import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearTripDestinationScopeCacheForTests } from "@/lib/tripDestinationScope";
import { resolveTripDestinationScopeWithGeocode } from "@/server/places/resolveTripDestinationScope";

const originalFetch = globalThis.fetch;

afterEach(() => {
  clearTripDestinationScopeCacheForTests();
  globalThis.fetch = originalFetch;
});

test("resolveTripDestinationScopeWithGeocode uses catalog when destination is known", async () => {
  const scope = await resolveTripDestinationScopeWithGeocode("日本");
  assert.ok(scope);
  assert.deepEqual(scope?.countryCodes, ["JP"]);
  assert.equal(scope?.source, "catalog");
});

test("resolveTripDestinationScopeWithGeocode geocodes unknown destination labels", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [142.8635, 43.2203] },
            properties: {
              osm_type: "R",
              osm_id: 12345,
              name: "Alpine Valley Retreat X9",
              state: "Hokkaido",
              country: "Japan",
              countrycode: "JP",
            },
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
