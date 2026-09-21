import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearTripDestinationScopeCacheForTests } from "@/lib/tripDestinationScope";
import { clearGeocodeMemoryCacheForTests } from "@/server/places/geocodePlace";
import { mapMemoryCache } from "@/server/maps/cache";
import { filterTripPlanByDestinationScope } from "@/server/services/filterTripPlanByDestinationScope";
import type { TripPlanResult } from "@/types";

const originalFetch = globalThis.fetch;
const originalKey = process.env.GOOGLE_MAPS_API_KEY;

afterEach(() => {
  clearTripDestinationScopeCacheForTests();
  clearGeocodeMemoryCacheForTests();
  mapMemoryCache.clear();
  globalThis.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.GOOGLE_MAPS_API_KEY;
  } else {
    process.env.GOOGLE_MAPS_API_KEY = originalKey;
  }
});

test("filterTripPlanByDestinationScope removes Golden Gate Bridge for Japan trip", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async (_input) => {
    const url =
      typeof _input === "string"
        ? _input
        : _input instanceof URL
          ? _input.toString()
          : _input.url;
    if (url.includes("Golden")) {
      return new Response(
        JSON.stringify({
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: { type: "Point", coordinates: [-122.4783, 37.8199] },
              properties: { name: "Golden Gate Bridge", osm_type: "W", osm_id: 1, country: "United States", countrycode: "US", city: "San Francisco" },
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [130.7059, 32.8062] },
            properties: { name: "熊本城", osm_type: "W", osm_id: 2, country: "Japan", countrycode: "JP", city: "Kumamoto" },
          },
        ],
      }),
      { status: 200 },
    );
  };

  const plan: TripPlanResult = {
    summary: "test",
    days: [
      {
        dayNumber: 1,
        theme: "Day 1",
        summary: "",
        items: [
          { id: "1", title: "熊本城", type: "attraction", time: "10:00" },
          { id: "2", title: "Golden Gate Bridge", type: "attraction", time: "14:00" },
        ],
      },
    ],
    warnings: [],
  };

  const { plan: filtered, removedCount } = await filterTripPlanByDestinationScope(plan, "日本");
  assert.equal(removedCount, 1);
  assert.equal(filtered.days[0]?.items.length, 1);
  assert.equal(filtered.days[0]?.items[0]?.title, "熊本城");
});
