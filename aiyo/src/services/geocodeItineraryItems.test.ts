import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  applyLocationUpdatesToItinerary,
  collectItineraryItemsMissingLocation,
  collectItineraryItemsMissingPlacePhotos,
  enrichItineraryItemsMissingPlacePhotos,
  geocodeItineraryItemsMissingLocation,
  geocodeQuery,
  resolveGeocodeQueryForItem,
  resolveLocationGeocodeQuery,
} from "@/services/geocodeItineraryItems";
import type { TripPlanDay, TripPlanItem } from "@/types";

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

test("geocodeQuery falls back to stripped query variants when original geocode misses", async () => {
  const seenQueries: string[] = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)) as { query: string };
    seenQueries.push(body.query);
    if (body.query === "澎漁宴 生猛海鮮-人氣海鮮餐廳 必吃美食") {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "not_found", message: "miss" },
        }),
        { status: 404 },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          place: {
            placeName: body.query,
            formattedAddress: "澎湖縣馬公市海埔路25號",
            placeId: "penghu-feast",
            lat: 23.5662,
            lng: 119.569,
            provider: "google-geocoding",
            confidence: 0.88,
          },
        },
      }),
      { status: 200 },
    );
  };

  const location = await geocodeQuery("澎漁宴 生猛海鮮-人氣海鮮餐廳 必吃美食", "澎湖");
  assert.equal(location?.lat, 23.5662);
  assert.equal(location?.name, "澎漁宴 生猛海鮮-人氣海鮮餐廳 必吃美食");
  assert.deepEqual(seenQueries, [
    "澎漁宴 生猛海鮮-人氣海鮮餐廳 必吃美食",
    "澎漁宴 生猛海鮮",
  ]);
});

test("geocodeQuery falls back to confident place suggestions", async () => {
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/api/places/geocode")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "not_found", message: "miss" },
        }),
        { status: 404 },
      );
    }
    const body = JSON.parse(String(init?.body)) as { query: string };
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          suggestions: [
            {
              placeName: `${body.query} 澎湖店`,
              formattedAddress: "880台灣澎湖縣馬公市海埔路25號",
              placeId: "suggested-place",
              lat: 23.5662,
              lng: 119.569,
              provider: "google-places",
              confidence: 0.71,
              sourceQuery: body.query,
            },
          ],
          autoResolve: null,
        },
      }),
      { status: 200 },
    );
  };

  const location = await geocodeQuery("澎漁宴", "澎湖");
  assert.equal(location?.placeId, "suggested-place");
  assert.equal(location?.name, "澎漁宴");
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

test("collectItineraryItemsMissingLocation returns only items without usable coordinates", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        item({
          id: "missing",
          title: "道頓堀",
          location: { name: "道頓堀", lat: 0, lng: 0, description: "道頓堀" },
        }),
        item({
          id: "ready",
          title: "通天閣",
          location: { name: "通天閣", lat: 34.6525, lng: 135.5063, description: "通天閣" },
        }),
      ],
    },
  ];

  const result = collectItineraryItemsMissingLocation(days);
  assert.deepEqual(
    result.map((entry) => ({ dayNumber: entry.dayNumber, itemId: entry.item.id })),
    [{ dayNumber: 1, itemId: "missing" }],
  );
});

test("applyLocationUpdatesToItinerary patches matching items only", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        item({
          id: "missing",
          title: "道頓堀",
          location: { name: "道頓堀", lat: 0, lng: 0, description: "道頓堀" },
        }),
        item({
          id: "untouched",
          title: "通天閣",
          location: { name: "通天閣", lat: 34.6525, lng: 135.5063, description: "通天閣" },
        }),
      ],
    },
  ];

  const updated = applyLocationUpdatesToItinerary(days, [
    {
      dayNumber: 1,
      itemId: "missing",
      location: {
        name: "道頓堀",
        lat: 34.6687,
        lng: 135.5013,
        description: "Dotonbori, Osaka, Japan",
        placeId: "dotonbori",
      },
    },
  ]);

  assert.equal(updated[0]?.items[0]?.location?.lat, 34.6687);
  assert.equal(updated[0]?.items[0]?.location?.placeId, "dotonbori");
  assert.equal(updated[0]?.items[1]?.location?.lat, 34.6525);
});

test("collectItineraryItemsMissingPlacePhotos returns only items with placeId but no usable photo", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        item({
          id: "needs-photo",
          title: "道頓堀",
          location: {
            name: "道頓堀",
            lat: 34.6687,
            lng: 135.5013,
            description: "道頓堀",
            placeId: "dotonbori",
          },
        }),
        item({
          id: "has-photo",
          title: "通天閣",
          location: {
            name: "通天閣",
            lat: 34.6525,
            lng: 135.5063,
            description: "通天閣",
            placeId: "tsutenkaku",
            photoUrl: "/api/map/place-photo?ref=abc123&placeId=tsutenkaku",
          },
        }),
      ],
    },
  ];

  const result = collectItineraryItemsMissingPlacePhotos(days);
  assert.deepEqual(
    result.map((entry) => ({ dayNumber: entry.dayNumber, itemId: entry.item.id })),
    [{ dayNumber: 1, itemId: "needs-photo" }],
  );
});

test("enrichItineraryItemsMissingPlacePhotos patches photo fields from place details", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          results: [
            {
              details: {
                photoUrl: "/api/map/place-photo?ref=dotonbori&placeId=dotonbori",
                thumbnail: "/api/map/place-photo?ref=dotonbori&placeId=dotonbori",
              },
            },
          ],
        },
      }),
      { status: 200 },
    );

  const updates = await enrichItineraryItemsMissingPlacePhotos(
    [
      {
        dayNumber: 1,
        item: item({
          id: "needs-photo",
          title: "道頓堀",
          location: {
            name: "道頓堀",
            lat: 34.6687,
            lng: 135.5013,
            description: "道頓堀",
            placeId: "dotonbori",
          },
        }),
      },
    ],
    "大阪",
  );

  assert.equal(updates.length, 1);
  assert.equal(
    updates[0]?.location.photoUrl,
    "/api/map/place-photo?ref=dotonbori&placeId=dotonbori",
  );
  assert.equal(
    updates[0]?.location.thumbnail,
    "/api/map/place-photo?ref=dotonbori&placeId=dotonbori",
  );
});
