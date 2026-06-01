import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearTripDestinationScopeCacheForTests, resolveTripDestinationScope } from "@/lib/tripDestinationScope";
import { clearGeocodeMemoryCacheForTests } from "@/server/places/geocodePlace";
import type { CanonicalPlaceCandidate } from "@/server/video/placeExtraction/types";
import { verifyCanonicalPlaces } from "@/server/video/placeExtraction/placeVerifier";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;

afterEach(() => {
  clearTripDestinationScopeCacheForTests();
  clearGeocodeMemoryCacheForTests();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_MAPS_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

const statueCandidate: CanonicalPlaceCandidate = {
  rawText: "Statue of Liberty",
  cleanedName: "Statue of Liberty",
  canonicalName: "Statue of Liberty",
  aliases: ["Statue of Liberty"],
  source: "title",
  confidence: 0.82,
  evidenceTexts: ["Statue of Liberty"],
};

test("verifyCanonicalPlaces rejects US geocode for Japan trip scope", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: "New York, NY, USA",
            place_id: "place-nyc",
            types: ["tourist_attraction", "point_of_interest"],
            geometry: { location: { lat: 40.6892, lng: -74.0445 } },
            address_components: [{ short_name: "US", types: ["country", "political"] }],
          },
        ],
      }),
      { status: 200 },
    );

  const destinationScope = resolveTripDestinationScope("日本");
  assert.ok(destinationScope);

  const verified = await verifyCanonicalPlaces([statueCandidate], {
    destinationHint: "日本",
    destinationScope,
    enableGeocode: true,
    enableSearch: false,
  });

  assert.equal(verified.length, 0);
});
