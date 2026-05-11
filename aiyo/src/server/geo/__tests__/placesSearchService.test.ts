import assert from "node:assert/strict";
import test from "node:test";

test("searchPlacesByText maps text search + details into PlaceSearchHit", async () => {
  process.env.GOOGLE_MAPS_API_KEY = "test-places-key";
  process.env.ENABLE_MOCK_MAPS = "false";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(typeof input === "string" ? input : "url" in input ? input.url : input);
    if (url.includes("/maps/api/place/textsearch/json")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          results: [
            {
              name: "測試牛肉湯",
              formatted_address: "台南市中西區民族路二段212號",
              geometry: { location: { lat: 22.997, lng: 120.202 } },
              place_id: "place_test_1",
              types: ["restaurant", "food"],
              rating: 4.5,
              user_ratings_total: 99,
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.includes("/maps/api/place/details/json")) {
      return new Response(
        JSON.stringify({
          status: "OK",
          result: {
            name: "測試牛肉湯",
            formatted_address: "台南市中西區民族路二段212號",
            geometry: { location: { lat: 22.997, lng: 120.202 } },
            opening_hours: { weekday_text: ["週一 11:00–21:00"] },
            formatted_phone_number: "06-1234567",
            website: "https://example.test",
            url: "https://maps.google.com/?cid=1",
            rating: 4.5,
            user_ratings_total: 99,
          },
        }),
        { status: 200 },
      );
    }
    return new Response("not mocked", { status: 500 });
  }) as typeof fetch;

  try {
    const { searchPlacesByText } = await import("@/server/geo/placesSearchService");
    const res = await searchPlacesByText("牛肉湯", "台南", { maxResults: 3 });
    assert.equal(res.ok, true);
    if (!res.ok) {
      return;
    }
    assert.equal(res.places.length, 1);
    assert.equal(res.places[0]?.name, "測試牛肉湯");
    assert.equal(res.places[0]?.placeId, "place_test_1");
    assert.ok(res.places[0]?.openingHours?.includes("週一"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
