import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultTravelToolRequests, buildTripPlanResearchRequests, buildNearbyTravelToolRequest, executeTravelToolRequests, parseTravelToolRequestsFromModel } from "@/server/services/travelResearchTools";
import type { PersonalizedAIContext } from "@/types";
import type { TripPlanRequest } from "@/types";
import { mapMemoryCache } from "@/server/maps/cache";
import { clearGeocodeMemoryCacheForTests } from "@/server/places/geocodePlace";
import { prisma } from "@/lib/prisma";

test("nearby requests resolve an explicit anchor and category", () => {
  assert.deepEqual(buildNearbyTravelToolRequest("請找淺草寺附近的餐廳"), {
    type: "search_nearby_places", anchor: "淺草寺", category: "restaurant", radius: 1500,
  });
  assert.equal(buildNearbyTravelToolRequest("推薦東京餐廳"), null);
  assert.deepEqual(buildNearbyTravelToolRequest("這個附近有餐廳嗎", {
    selectedPlace: { id: "pin_1", name: "淺草寺", lat: 35.7148, lng: 139.7967 },
  }), {
    type: "search_nearby_places", anchor: "淺草寺", category: "restaurant", radius: 1500,
  });
  for (const message of ["這份行程裡的淺草寺附近有餐廳嗎", "第二天的淺草寺附近找午餐", "行程中的淺草寺附近有餐廳嗎", "淺草寺周圍有餐廳嗎", "淺草寺周邊有餐廳嗎"]) {
    assert.equal(buildNearbyTravelToolRequest(message, { destination: "東京" })?.anchor, "淺草寺");
  }
  assert.equal(buildDefaultTravelToolRequests("淺草寺附近有餐廳嗎", { destination: "東京" })[0]?.type, "search_nearby_places");
});

test("nearby research resolves a verified anchor before searching local restaurants", async () => {
  const originalFetch = globalThis.fetch;
  mapMemoryCache.clear();
  clearGeocodeMemoryCacheForTests();
  const urls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    if (url.includes("/api?")) return new Response(JSON.stringify({ type: "FeatureCollection", features: [{
      type: "Feature", geometry: { type: "Point", coordinates: [139.7967, 35.7148] },
      properties: { osm_type: "W", osm_id: 123, name: "淺草寺", country: "Japan", countrycode: "JP", city: "Tokyo" },
    }] }), { status: 200 });
    return new Response(JSON.stringify({ elements: [{ type: "node", id: 456, lat: 35.715, lon: 139.797, tags: { name: "附近餐廳", amenity: "restaurant" } }] }), { status: 200 });
  };
  try {
    const request = buildNearbyTravelToolRequest("這份行程裡的淺草寺附近有餐廳嗎", { destination: "東京" });
    assert.ok(request);
    const result = await executeTravelToolRequests([request], { destination: "東京" });
    assert.equal(result.placeHits[0]?.name, "附近餐廳");
    assert.match(result.text, /淺草寺 附近地點/);
    assert.ok(urls.every((url) => !url.includes("googleapis.com")));
  } finally {
    globalThis.fetch = originalFetch;
    mapMemoryCache.clear();
    clearGeocodeMemoryCacheForTests();
  }
});

test("nearby research reuses verified coordinates from the authorized trip when geocoding is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  const originalItems = prisma.tripItem.findMany;
  const originalPins = prisma.mapPin.findMany;
  const urls: string[] = [];
  mapMemoryCache.clear();
  Object.assign(prisma.tripItem, { findMany: async (args: { where: { tripId: string; title: string } }) => {
    assert.equal(args.where.tripId, "authorized-trip");
    assert.equal(args.where.title, "淺草寺");
    return [{ latitude: 35.7148, longitude: 139.7967 }];
  } });
  Object.assign(prisma.mapPin, { findMany: async (args: { where: { tripId: string } }) => {
    assert.equal(args.where.tripId, "authorized-trip");
    return [];
  } });
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    return new Response(JSON.stringify({ elements: [{ type: "node", id: 456, lat: 35.715, lon: 139.797, tags: { name: "附近餐廳", amenity: "restaurant" } }] }), { status: 200 });
  };
  try {
    const verified = { currentTrip: { id: "authorized-trip" } } as PersonalizedAIContext;
    const result = await executeTravelToolRequests([
      { type: "search_nearby_places", anchor: "淺草寺", category: "restaurant", radius: 1500 },
    ], { destination: "東京" }, undefined, verified);
    assert.equal(result.placeHits[0]?.name, "附近餐廳");
    assert.ok(urls.length > 0);
    assert.ok(urls.every((url) => !url.includes("/api?")), "Photon should not be needed for a saved verified anchor");
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(prisma.tripItem, { findMany: originalItems });
    Object.assign(prisma.mapPin, { findMany: originalPins });
    mapMemoryCache.clear();
  }
});

test("nearby research falls back to geocoding when saved coordinates cannot be read", async () => {
  const originalFetch = globalThis.fetch;
  const originalItems = prisma.tripItem.findMany;
  const originalPins = prisma.mapPin.findMany;
  const urls: string[] = [];
  mapMemoryCache.clear();
  clearGeocodeMemoryCacheForTests();
  Object.assign(prisma.tripItem, { findMany: async () => { throw new Error("database unavailable"); } });
  Object.assign(prisma.mapPin, { findMany: async () => [] });
  globalThis.fetch = async (input) => {
    const url = input instanceof Request ? input.url : String(input);
    urls.push(url);
    if (url.includes("/api?")) return new Response(JSON.stringify({ type: "FeatureCollection", features: [{
      type: "Feature", geometry: { type: "Point", coordinates: [139.7967, 35.7148] },
      properties: { osm_type: "W", osm_id: 123, name: "淺草寺", country: "Japan", countrycode: "JP", city: "Tokyo" },
    }] }), { status: 200 });
    return new Response(JSON.stringify({ elements: [{ type: "node", id: 456, lat: 35.715, lon: 139.797, tags: { name: "附近餐廳", amenity: "restaurant" } }] }), { status: 200 });
  };
  try {
    const verified = { currentTrip: { id: "authorized-trip" } } as PersonalizedAIContext;
    const result = await executeTravelToolRequests([
      { type: "search_nearby_places", anchor: "淺草寺", category: "restaurant", radius: 1500 },
    ], { destination: "東京" }, undefined, verified);
    assert.equal(result.placeHits[0]?.name, "附近餐廳");
    assert.ok(urls.some((url) => url.includes("/api?")));
  } finally {
    globalThis.fetch = originalFetch;
    Object.assign(prisma.tripItem, { findMany: originalItems });
    Object.assign(prisma.mapPin, { findMany: originalPins });
    mapMemoryCache.clear();
    clearGeocodeMemoryCacheForTests();
  }
});

test("trusted trip tools only reveal server-verified context", async () => {
  const parsed = parseTravelToolRequestsFromModel([{ type: "get_current_trip" }, { type: "search_past_trips" }, { type: "get_route_matrix", points: [{ lat: 999, lng: 0 }] }]);
  assert.equal(parsed.length, 2);
  const verified = {
    currentTrip: { id: "trip-1", title: "東京行程", days: [{ id: "day-1", dayNumber: 1, items: [{ id: "item-1", title: "淺草寺" }] }] },
    recentTrips: [{ id: "old", title: "京都行程", representativeItems: ["清水寺"] }],
  } as unknown as PersonalizedAIContext;
  const result = await executeTravelToolRequests(parsed, undefined, undefined, verified);
  assert.match(result.text, /淺草寺/);
  assert.match(result.text, /清水寺/);
  const empty = await executeTravelToolRequests([{ type: "get_current_trip" }]);
  assert.match(empty.text, /沒有可讀取/);
});

test("model tool requests reject unknown fields and unbounded provider queries", () => {
  const accepted = parseTravelToolRequestsFromModel([
    { type: "get_current_trip", tripId: "other-user-trip" },
    { type: "search_place", query: "東京".repeat(100) },
    { type: "tavily_search", query: "x".repeat(181) },
    { type: "youtube_search", keyword: "東京", limit: 999 },
    { type: "search_nearby_places", anchor: "淺草寺", category: "restaurant", radius: 1500, url: "https://example.com" },
    { type: "get_current_trip" },
    { type: "search_place", query: "淺草寺", locationHint: "東京" },
  ]);
  assert.deepEqual(accepted, [{ type: "get_current_trip" }, { type: "search_place", query: "淺草寺", locationHint: "東京" }]);
  assert.equal(parseTravelToolRequestsFromModel(Array.from({ length: 20 }, () => ({ type: "get_current_trip" }))).length, 8);
});

test("buildTripPlanResearchRequests always includes place search for full trip generation", () => {
  const request: TripPlanRequest = {
    destination: "東京",
    days: 3,
    preferences: {
      interests: ["美食", "逛街"],
      pace: "moderate",
      transportPreference: "public_transport",
    },
  };

  const requests = buildTripPlanResearchRequests(request);
  assert.ok(requests.some((item) => item.type === "search_place"));
});

test("buildTripPlanResearchRequests adds weather when dates exist", () => {
  const request: TripPlanRequest = {
    destination: "熊本",
    days: 5,
    tripStartDate: "2026-10-01",
    tripEndDate: "2026-10-05",
    preferences: {
      interests: ["美食", "溫泉"],
      pace: "moderate",
      transportPreference: "public_transport",
      notes: "請幫我確認這趟旅程的天氣如何",
    },
  };

  const requests = buildTripPlanResearchRequests(request);
  const weatherRequest = requests.find((item) => item.type === "weather_forecast");
  assert.ok(weatherRequest);
  assert.equal(weatherRequest?.startDate, "2026-10-01");
  assert.equal(weatherRequest?.endDate, "2026-10-05");
});
