import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultTravelToolRequests, buildTripPlanResearchRequests } from "@/server/services/travelResearchTools";
import type { TripPlanRequest } from "@/types";

test("buildTripPlanResearchRequests propagates trip dates into weather and event lookups", () => {
  const request: TripPlanRequest = {
    destination: "熊本",
    days: 5,
    tripStartDate: "2026-10-01",
    tripEndDate: "2026-10-05",
    preferences: {
      interests: ["美食", "溫泉"],
      pace: "moderate",
      transportPreference: "public_transport",
    },
  };

  const requests = buildTripPlanResearchRequests(request);
  const weatherRequest = requests.find((item) => item.type === "weather_forecast");

  assert.ok(weatherRequest);
  assert.equal(weatherRequest?.type, "weather_forecast");
  assert.equal(weatherRequest?.startDate, "2026-10-01");
  assert.equal(weatherRequest?.endDate, "2026-10-05");
  assert.ok(!requests.some((item) => item.type === "youtube_search"));
});

test("buildDefaultTravelToolRequests only adds youtube for explicit video inspiration requests", () => {
  const videoRequests = buildDefaultTravelToolRequests("幫我找幾個熊本旅遊影片當靈感來源", {
    destination: "熊本",
  });
  assert.ok(videoRequests.some((request) => request.type === "youtube_search"));

  const normalRequests = buildDefaultTravelToolRequests("幫我找熊本適合晚上去的地方", {
    destination: "熊本",
  });
  assert.ok(!normalRequests.some((request) => request.type === "youtube_search"));
});

test("buildDefaultTravelToolRequests does not always force weather search", () => {
  const requests = buildDefaultTravelToolRequests("熊本晚上有什麼景點推薦？", {
    destination: "熊本",
  });
  assert.ok(!requests.some((request) => request.type === "weather_forecast"));
});
