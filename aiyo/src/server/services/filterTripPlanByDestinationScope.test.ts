import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearTripDestinationScopeCacheForTests } from "@/lib/tripDestinationScope";
import { clearGeocodeMemoryCacheForTests } from "@/server/places/geocodePlace";
import { filterTripPlanByDestinationScope } from "@/server/services/filterTripPlanByDestinationScope";
import type { TripPlanResult } from "@/types";

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

test("filterTripPlanByDestinationScope removes Golden Gate Bridge for Japan trip", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-key";
  globalThis.fetch = async (_input, init) => {
    const url =
      typeof _input === "string"
        ? _input
        : _input instanceof URL
          ? _input.toString()
          : _input.url;
    if (url.includes("Golden")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              formatted_address: "Golden Gate Bridge, San Francisco, CA, USA",
              place_id: "ggb",
              types: ["tourist_attraction"],
              geometry: { location: { lat: 37.8199, lng: -122.4783 } },
              address_components: [{ short_name: "US", types: ["country", "political"] }],
            },
          ],
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        status: "OK",
        results: [
          {
            formatted_address: "Kumamoto Castle, Japan",
            place_id: "kumamoto",
            types: ["tourist_attraction"],
            geometry: { location: { lat: 32.8062, lng: 130.7059 } },
            address_components: [{ short_name: "JP", types: ["country", "political"] }],
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
