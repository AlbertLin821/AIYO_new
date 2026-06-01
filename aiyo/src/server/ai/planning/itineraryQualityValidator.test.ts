import assert from "node:assert/strict";
import test from "node:test";
import { validateItineraryQuality } from "@/server/ai/planning/itineraryQualityValidator";
import { INSUFFICIENT_RESEARCH_WARNING } from "@/server/ai/planning/itineraryPlanningStandard";
import type { TripPlanRequest, TripPlanResult } from "@/types";

const request: TripPlanRequest = {
  destination: "東京",
  days: 3,
  preferences: {
    interests: ["美食"],
    pace: "moderate",
    transportPreference: "public_transport",
  },
};

test("rejects placeholder fallback titles", () => {
  const plan: TripPlanResult = {
    summary: "test",
    warnings: [],
    days: [
      {
        dayNumber: 1,
        theme: "day1",
        summary: "day1",
        items: [
          { id: "1", dayNumber: 1, time: "09:00", title: "東京 代表性景點", type: "attraction", transport: "大眾運輸", notes: "", source: "ai" },
          { id: "2", dayNumber: 1, time: "12:30", title: "午餐", type: "restaurant", transport: "大眾運輸", notes: "於上野一帶", source: "ai" },
          { id: "3", dayNumber: 1, time: "15:00", title: "淺草寺", type: "attraction", transport: "大眾運輸", notes: "", source: "ai" },
          { id: "4", dayNumber: 1, time: "18:30", title: "晚餐", type: "restaurant", transport: "大眾運輸", notes: "於淺草一帶", source: "ai" },
        ],
      },
      {
        dayNumber: 2,
        theme: "day2",
        summary: "day2",
        items: [
          { id: "5", dayNumber: 2, time: "09:30", title: "秋葉原", type: "attraction", transport: "大眾運輸", notes: "", source: "ai" },
          { id: "6", dayNumber: 2, time: "12:30", title: "午餐", type: "restaurant", transport: "大眾運輸", notes: "於秋葉原", source: "ai" },
          { id: "7", dayNumber: 2, time: "15:00", title: "涉谷", type: "activity", transport: "大眾運輸", notes: "", source: "ai" },
          { id: "8", dayNumber: 2, time: "18:30", title: "晚餐", type: "restaurant", transport: "大眾運輸", notes: "於涉谷", source: "ai" },
        ],
      },
      {
        dayNumber: 3,
        theme: "day3",
        summary: "day3",
        items: [
          { id: "9", dayNumber: 3, time: "09:30", title: "築地", type: "attraction", transport: "大眾運輸", notes: "", source: "ai" },
          { id: "10", dayNumber: 3, time: "12:30", title: "午餐", type: "restaurant", transport: "大眾運輸", notes: "於築地", source: "ai" },
          { id: "11", dayNumber: 3, time: "15:00", title: "東京車站", type: "activity", transport: "大眾運輸", notes: "", source: "ai" },
        ],
      },
    ],
  };

  const issues = validateItineraryQuality(plan, request);
  assert.ok(issues.some((issue) => issue.path.includes("title")));
});

test("requires insufficient research warning when flagged", () => {
  const plan: TripPlanResult = {
    summary: "test",
    warnings: [],
    days: [],
  };
  const issues = validateItineraryQuality(plan, request, { researchInsufficient: true });
  assert.ok(issues.some((issue) => issue.message.includes(INSUFFICIENT_RESEARCH_WARNING)));
});
