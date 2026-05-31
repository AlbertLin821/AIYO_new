import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTripPlanResearchPlan,
  shouldLoadSupplementarySources,
} from "@/server/ai/planning/tripPlanResearchPolicy";
import type { TripPlanRequest } from "@/types";

const tokyo3d2n: TripPlanRequest = {
  destination: "東京",
  days: 3,
  preferences: {
    interests: ["美食", "逛街", "夜景"],
    pace: "moderate",
    transportPreference: "public_transport",
    notes: "兩人中等預算，大眾運輸",
  },
};

test("tokyo 3D2N without dates always researches POI and skips weather", () => {
  const plan = buildTripPlanResearchPlan(tokyo3d2n);
  assert.equal(plan.shouldResearch, true);
  assert.ok(plan.toolRequests.some((item) => item.type === "search_place"));
  assert.ok(
    plan.toolRequests.some((item) => item.type === "search_place" && item.query.includes("餐廳")),
  );
  assert.ok(!plan.toolRequests.some((item) => item.type === "weather_forecast"));
});

test("tokyo 3D2N with dates adds weather and web event query", () => {
  const plan = buildTripPlanResearchPlan({
    ...tokyo3d2n,
    tripStartDate: "2026-06-01",
    tripEndDate: "2026-06-03",
  });
  assert.ok(plan.toolRequests.some((item) => item.type === "weather_forecast"));
  assert.ok(plan.webSearchQueries.length >= 1);
});

test("freshness notes trigger supplementary sources", () => {
  assert.equal(
    shouldLoadSupplementarySources({
      generatedSourceCount: 2,
      freshnessRequired: true,
      profileNotes: "",
      requireCitations: false,
    }),
    true,
  );
});

test("supplementary skipped when sources exist and no citation requirement", () => {
  assert.equal(
    shouldLoadSupplementarySources({
      generatedSourceCount: 3,
      freshnessRequired: false,
      profileNotes: "想吃拉麵",
      requireCitations: false,
    }),
    false,
  );
});
