import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildManualPlacePlaceholderLocation,
  finalizeManualPlaceLocation,
  locationFromPlaceSuggestion,
  resolveManualPlaceGeocodeQuery,
  resolveManualPlaceLocation,
} from "@/services/resolveManualPlaceLocation";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("locationFromPlaceSuggestion keeps photo fields from suggestion", () => {
  const location = locationFromPlaceSuggestion(
    {
      placeName: "一蘭拉麵",
      formattedAddress: "大阪市",
      placeId: "ChIJ_test",
      lat: 34.69,
      lng: 135.5,
      provider: "google-places",
      photoUrl: "/api/map/place-photo?ref=abc123",
      thumbnail: "/api/map/place-photo?ref=abc123",
    },
    "一蘭",
  );
  assert.equal(location.photoUrl, "/api/map/place-photo?ref=abc123&placeId=ChIJ_test");
  assert.equal(location.placeId, "ChIJ_test");
});

test("finalizeManualPlaceLocation fetches place details when photo is missing", async () => {
  let detailsCalled = false;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.href;
    if (url.includes("/api/map/place-details")) {
      detailsCalled = true;
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                id: "ChIJ_test",
                details: {
                  photoUrl: "/api/map/place-photo?ref=xyz789",
                  thumbnail: "/api/map/place-photo?ref=xyz789",
                },
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  };

  const location = await finalizeManualPlaceLocation(
    {
      placeName: "道頓堀",
      formattedAddress: "Dotonbori, Osaka",
      placeId: "ChIJ_test",
      lat: 34.6687,
      lng: 135.5013,
      provider: "google-geocoding",
    },
    "道頓堀",
    "大阪",
  );
  assert.equal(detailsCalled, true);
  assert.equal(location.photoUrl, "/api/map/place-photo?ref=xyz789");
});

test("resolveManualPlaceLocation returns failed with reason when suggest API errors", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: false,
        error: { code: "missing_api_key", message: "Google Maps API key is not configured." },
      }),
      { status: 503 },
    );

  const result = await resolveManualPlaceLocation("道頓堀", "大阪");
  assert.equal(result.status, "failed");
  if (result.status === "failed") {
    assert.equal(result.reason, "missing_api_key");
  }
});

test("resolveManualPlaceLocation returns choose when suggestions are ambiguous", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          suggestions: [
            {
              placeName: "一蘭拉麵",
              formattedAddress: "大阪市",
              lat: 34.69,
              lng: 135.5,
              provider: "google-places",
              confidence: 0.78,
            },
            {
              placeName: "一風堂",
              formattedAddress: "大阪市",
              lat: 34.7,
              lng: 135.51,
              provider: "google-places",
              confidence: 0.76,
            },
          ],
          autoResolve: null,
        },
      }),
      { status: 200 },
    );

  const result = await resolveManualPlaceLocation("拉麵", "大阪");
  assert.equal(result.status, "choose");
  if (result.status === "choose") {
    assert.equal(result.suggestions.length, 2);
  }
});

test("resolveManualPlaceLocation auto-applies exact match", async () => {
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.href;
    if (url.includes("/api/places/suggest")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            suggestions: [
              {
                placeName: "道頓堀",
                formattedAddress: "Dotonbori, Osaka",
                lat: 34.6687,
                lng: 135.5013,
                provider: "google-geocoding",
                confidence: 0.92,
              },
            ],
            autoResolve: {
              placeName: "道頓堀",
              formattedAddress: "Dotonbori, Osaka",
              placeId: "ChIJ_dotonbori",
              lat: 34.6687,
              lng: 135.5013,
              provider: "google-geocoding",
              confidence: 0.92,
            },
          },
        }),
        { status: 200 },
      );
    }
    if (url.includes("/api/map/place-details")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            results: [
              {
                id: "ChIJ_dotonbori",
                details: {
                  photoUrl: "/api/map/place-photo?ref=dotonbori",
                },
              },
            ],
          },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ success: false }), { status: 500 });
  };

  const result = await resolveManualPlaceLocation("道頓堀", "大阪");
  assert.equal(result.status, "auto");
  if (result.status === "auto") {
    assert.equal(result.location.name, "道頓堀");
    assert.equal(result.location.lat, 34.6687);
    assert.equal(result.location.photoUrl, "/api/map/place-photo?ref=dotonbori");
  }
});

test("resolveManualPlaceGeocodeQuery prefers location over title", () => {
  assert.equal(resolveManualPlaceGeocodeQuery("午餐", "熊本城"), "熊本城");
  assert.equal(resolveManualPlaceGeocodeQuery("熊本城", ""), "熊本城");
});

test("buildManualPlacePlaceholderLocation uses null island placeholder", () => {
  const location = buildManualPlacePlaceholderLocation("測試地點");
  assert.equal(location.name, "測試地點");
  assert.equal(location.lat, 0);
  assert.equal(location.lng, 0);
});
