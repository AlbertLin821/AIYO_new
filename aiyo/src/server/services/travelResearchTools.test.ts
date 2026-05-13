import assert from "node:assert/strict";
import test from "node:test";
import { buildTripPlanResearchRequests } from "@/server/services/travelResearchTools";
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
  const youtubeRequest = requests.find((item) => item.type === "youtube_search");

  assert.ok(weatherRequest);
  assert.equal(weatherRequest?.type, "weather_forecast");
  assert.equal(weatherRequest?.startDate, "2026-10-01");
  assert.equal(weatherRequest?.endDate, "2026-10-05");
  assert.ok(youtubeRequest);
  assert.equal(youtubeRequest?.type, "youtube_search");
});
