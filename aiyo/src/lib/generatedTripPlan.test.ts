import assert from "node:assert/strict";
import test from "node:test";
import type { ChatResponsePayload, TravelPlanResponse, TripPlanResult } from "@/types";
import {
  countTripPlanItems,
  pickPreferredGeneratedTripPlan,
  repairSparseItineraryFromLatestChatTravelPlan,
  repairSparseItineraryDaysFromTravelPlan,
} from "./generatedTripPlan";

const travelPlan: TravelPlanResponse = {
  response_type: "travel_plan",
  title: "嘉義 2 天",
  summary_table: [],
  days: [
    {
      day: "Day 1",
      theme: "森林之歌",
      transportation: [],
      spots: [
        { name: "森林之歌", feature: "散步" },
        { name: "檜意森活村", feature: "逛街" },
      ],
      food_recommendations: [{ name: "林聰明沙鍋魚頭", description: "午餐" }],
      tips: [],
    },
    {
      day: "Day 2",
      theme: "嘉義公園",
      transportation: [],
      spots: [{ name: "嘉義公園", feature: "晨間散步" }],
      food_recommendations: [],
      tips: [],
    },
  ],
  weather_alerts: [],
  event_alerts: [],
  assumptions: [],
};

test("pickPreferredGeneratedTripPlan prefers richer reply travel plan", () => {
  const sparsePlan: TripPlanResult = {
    summary: "sparse",
    days: [
      { dayNumber: 1, theme: "森林之歌", summary: "第 1 天以 森林之歌 為主。", items: [] },
      { dayNumber: 2, theme: "嘉義公園", summary: "第 2 天以 嘉義公園 為主。", items: [] },
    ],
  };

  const response = {
    itinerarySuggestion: sparsePlan,
    reply: {
      id: "msg",
      role: "assistant",
      content: "",
      timestamp: "",
      responseType: "travel_plan",
      travelPlan,
    },
    tripProfile: {
      destination: "嘉義",
      duration_days: 2,
      duration_nights: 1,
      departure_location: null,
      travel_dates: null,
      companions: null,
      traveler_count: null,
      budget: null,
      special_population: { has_elderly: false, has_children: false, mobility_issue: false },
      preferences: [],
      transportation: null,
      accommodation: null,
      visited_before: [],
      avoid_places: [],
      dietary_restrictions: [],
      disliked_activities: [],
      pace: null,
      plan_integration: "direct_merge" as const,
    },
  } satisfies Pick<ChatResponsePayload, "itinerarySuggestion" | "reply" | "tripProfile">;

  const picked = pickPreferredGeneratedTripPlan(response);
  assert.ok(picked);
  assert.equal(countTripPlanItems(picked), 4);
});

test("repairSparseItineraryDaysFromTravelPlan fills only auto-generated empty days", () => {
  const repaired = repairSparseItineraryDaysFromTravelPlan(
    [
      {
        dayNumber: 1,
        theme: "森林之歌",
        summary: "第 1 天以 森林之歌、檜意森活村 為主。",
        items: [],
      },
      {
        dayNumber: 2,
        theme: "嘉義公園",
        summary: "尚未安排內容",
        items: [],
      },
    ],
    travelPlan,
    2,
  );

  assert.ok(repaired);
  assert.equal(repaired?.[0]?.items.length, 3);
  assert.equal(repaired?.[1]?.items.length, 1);
});

test("pickPreferredGeneratedTripPlan fills empty structured days from reply travel plan", () => {
  const response = {
    itinerarySuggestion: {
      summary: "structured",
      days: [
        { dayNumber: 1, theme: "森林之歌", summary: "尚未安排內容", items: [] },
        { dayNumber: 2, theme: "嘉義公園", summary: "第 2 天以 嘉義公園 為主。", items: [] },
      ],
    },
    reply: {
      id: "msg",
      role: "assistant",
      content: "",
      timestamp: "",
      responseType: "travel_plan",
      travelPlan,
    },
    tripProfile: {
      destination: "嘉義",
      duration_days: 2,
      duration_nights: 1,
      departure_location: null,
      travel_dates: null,
      companions: null,
      traveler_count: null,
      budget: null,
      special_population: { has_elderly: false, has_children: false, mobility_issue: false },
      preferences: [],
      transportation: null,
      accommodation: null,
      visited_before: [],
      avoid_places: [],
      dietary_restrictions: [],
      disliked_activities: [],
      pace: null,
      plan_integration: "direct_merge" as const,
    },
  } satisfies Pick<ChatResponsePayload, "itinerarySuggestion" | "reply" | "tripProfile">;

  const picked = pickPreferredGeneratedTripPlan(response);
  assert.ok(picked);
  assert.equal(picked.days[0]?.items.length, 3);
  assert.equal(picked.days[1]?.items.length, 1);
});

test("repairSparseItineraryDaysFromTravelPlan also fills placeholder summaries when theme matches first place", () => {
  const repaired = repairSparseItineraryDaysFromTravelPlan(
    [
      {
        dayNumber: 1,
        theme: "森林之歌",
        summary: "尚未安排內容",
        items: [],
      },
      {
        dayNumber: 2,
        theme: "嘉義公園",
        summary: "尚未安排內容",
        items: [],
      },
    ],
    travelPlan,
    2,
  );

  assert.ok(repaired);
  assert.equal(repaired?.[0]?.items[0]?.title, "森林之歌");
  assert.equal(repaired?.[1]?.items[0]?.title, "嘉義公園");
});

test("repairSparseItineraryFromLatestChatTravelPlan uses the newest travel plan message", () => {
  const repaired = repairSparseItineraryFromLatestChatTravelPlan(
    [
      {
        dayNumber: 1,
        theme: "森林之歌",
        summary: "尚未安排內容",
        items: [],
      },
      {
        dayNumber: 2,
        theme: "嘉義公園",
        summary: "尚未安排內容",
        items: [],
      },
    ],
    [
      {
        id: "old",
        role: "assistant",
        content: "",
        timestamp: "",
        responseType: "travel_plan",
        travelPlan: {
          ...travelPlan,
          days: [travelPlan.days[1]!, travelPlan.days[0]!],
        },
      },
      {
        id: "latest",
        role: "assistant",
        content: "",
        timestamp: "",
        responseType: "travel_plan",
        travelPlan,
      },
    ],
    2,
  );

  assert.ok(repaired);
  assert.equal(repaired?.[0]?.items[0]?.title, "森林之歌");
  assert.equal(repaired?.[1]?.items[0]?.title, "嘉義公園");
});
