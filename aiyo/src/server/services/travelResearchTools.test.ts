import assert from "node:assert/strict";
import test from "node:test";
import { buildTripPlanResearchRequests } from "@/server/services/travelResearchTools";
import type { TripPlanRequest } from "@/types";

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
