import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  geocodeItineraryItemsMissingLocation,
  geocodeQuery,
  resolveGeocodeQueryForItem,
  resolveLocationGeocodeQuery,
} from "@/services/geocodeItineraryItems";
import type { TripPlanItem } from "@/types";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function item(partial: Partial<TripPlanItem> & Pick<TripPlanItem, "title">): TripPlanItem {
  return {
    id: "item-1",
    time: "09:00",
    type: "attraction",
    ...partial,
  };
}

test("geocodeQuery uses scoped places geocode API", async () => {
  let requestBody: unknown;
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          place: {
            placeName: "道頓堀",
            formattedAddress: "Dotonbori, Osaka, Japan",
            placeId: "dotonbori",
            lat: 34.6687,
            lng: 135.5013,
            provider: "google-geocoding",
            confidence: 0.92,
          },
        },
      }),
      { status: 200 },
    );
  };

  const location = await geocodeQuery("道頓堀", "大阪");
  assert.equal((requestBody as { query: string }).query, "道頓堀");
  assert.equal((requestBody as { destinationHint: string }).destinationHint, "大阪");
  assert.equal((requestBody as { purpose: string }).purpose, "itinerary_item");
  assert.equal(location?.lat, 34.6687);
  assert.equal(location?.name, "道頓堀");
});

test("geocodeItineraryItemsMissingLocation prefers location name over title", async () => {
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          place: {
            placeName: body.query,
            formattedAddress: body.query,
            lat: 35.7101,
            lng: 139.8107,
            provider: "google-geocoding",
          },
        },
      }),
      { status: 200 },
    );
  };

  const updates = await geocodeItineraryItemsMissingLocation(
    [
      {
        dayNumber: 1,
        item: item({
          id: "manual-1",
          title: "午餐",
          location: { name: "東京晴空塔", lat: 0, lng: 0, description: "東京晴空塔" },
        }),
      },
    ],
    "東京",
  );

  assert.equal(updates.length, 1);
  assert.equal(updates[0]?.location.name, "東京晴空塔");
  assert.equal(updates[0]?.location.lat, 35.7101);
});

test("resolveLocationGeocodeQuery prefers location name over title", () => {
  const entry = item({
    title: "午餐",
    location: {
      name: "道頓堀",
      lat: 0,
      lng: 0,
      description: "道頓堀",
    },
  });
  assert.equal(resolveLocationGeocodeQuery(entry), "道頓堀");
  assert.equal(resolveGeocodeQueryForItem(entry), "道頓堀");
});

test("resolveLocationGeocodeQuery falls back to address then notes before title", () => {
  assert.equal(
    resolveLocationGeocodeQuery(
      item({
        title: "自由活動",
        location: {
          name: "",
          address: "大阪城",
          lat: 0,
          lng: 0,
          description: "大阪城",
        },
      }),
    ),
    "大阪城",
  );

  assert.equal(
    resolveLocationGeocodeQuery(
      item({
        title: "自由活動",
        notes: "地點：神戶港",
      }),
    ),
    "神戶港",
  );
});

test("resolveGeocodeQueryForItem uses title only when no location hints exist", () => {
  assert.equal(resolveLocationGeocodeQuery(item({ title: "東京晴空塔" })), "");
  assert.equal(resolveGeocodeQueryForItem(item({ title: "東京晴空塔" })), "東京晴空塔");
});
