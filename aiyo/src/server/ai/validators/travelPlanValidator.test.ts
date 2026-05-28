import assert from "node:assert/strict";
import test from "node:test";

import {
  validateTravelPlanResponseQuality,
  validateTripPlanQuality,
} from "@/server/ai/validators/travelPlanValidator";
import type { TripPlanRequest, TripPlanResult } from "@/types";

function makeRequest(): TripPlanRequest {
  return {
    destination: "熊本",
    days: 1,
    preferences: {
      interests: ["food"],
      pace: "moderate",
      transportPreference: "public_transport",
      avoid: ["太趕"],
    },
  };
}

test("validateTripPlanQuality reports chronological and title quality issues", () => {
  const plan: TripPlanResult = {
    summary: "熊本一日行程",
    days: [
      {
        dayNumber: 1,
        items: [
          { id: "1", time: "10:00", title: "熊本城", type: "attraction" },
          { id: "2", time: "09:00", title: "熊本城・水前寺成趣園", type: "attraction" },
          {
            id: "3",
            time: "12:00",
            title: "午餐",
            type: "restaurant",
            notes: "不要太趕",
            location: { name: "午餐", lat: 0, lng: 0, description: "placeholder" },
          },
        ],
      },
    ],
  };

  const issues = validateTripPlanQuality(plan, makeRequest());

  assert.ok(issues.some((issue) => issue.message.includes("4 to 7")));
  assert.ok(issues.some((issue) => issue.message.includes("chronological")));
  assert.ok(issues.some((issue) => issue.message.includes("one searchable place")));
  assert.ok(issues.some((issue) => issue.message.includes("Avoid term")));
  assert.ok(issues.some((issue) => issue.message.includes("coordinates")));
});

test("validateTravelPlanResponseQuality reports citation ids that are not registered", () => {
  const issues = validateTravelPlanResponseQuality({
    response_type: "travel_plan",
    title: "熊本行程",
    sources: {
      source_1: {
        source_id: "source_1",
        type: "web",
        provider: "test",
        title: "來源",
        url: "https://example.com",
        domain: "example.com",
        snippet: "摘要",
        preview_text: "預覽",
        retrieved_at: "2026-05-28T00:00:00.000Z",
        reliability: "high",
      },
    },
    summary_table: [{ day: "Day 1", main_route: "熊本城", citations: ["missing_source"] }],
    days: [],
    weather_alerts: [],
    event_alerts: [],
    assumptions: [],
  });

  assert.ok(issues.some((issue) => issue.message.includes("missing_source")));
});
