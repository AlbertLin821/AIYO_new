import assert from "node:assert/strict";
import test from "node:test";

import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { decideTravelAgentMode } from "@/server/ai/travelAgentOrchestrator";

function makeAiContext(preferences: NonNullable<AIContextBuildResult["structured"]["preferences"]>): AIContextBuildResult {
  return {
    text: "[使用者偏好摘要]\n預算：中等預算\n旅遊風格：美食、購物",
    promptContextText: "[使用者偏好摘要]\n預算：中等預算\n旅遊風格：美食、購物",
    sources: ["user_preferences"],
    structured: {
      preferences,
      recentTripCount: 1,
      recentVideoCount: 0,
      appliedVideoSummaryCount: 0,
    },
    structuredContext: {
      userId: "user_1",
      preferences: {
        destinationPreferences: preferences.destination ? [preferences.destination] : undefined,
        budgetLevel: preferences.budgetLevel,
        travelStyles: preferences.travelStyle || preferences.travelStyles,
        pace: preferences.pace,
        transportPreference: preferences.transportPreference || null,
        accommodationPreference: preferences.accommodationPreference || null,
        avoidances: preferences.avoid,
        confidence: preferences.confidence,
        source: preferences.source,
        updatedAt: preferences.updatedAt,
      },
      recentTrips: [],
      tripChatHistory: [],
      globalChatMemory: [],
      videoInteractions: [],
      appliedVideoSummaries: [],
      memorySnippets: [],
      contextWarnings: [],
    },
    debug: {
      sources: ["user_preferences"],
      includedSources: ["user_preferences"],
      excludedSources: [],
      counts: {},
      limits: {},
      vectorStore: "mem0",
    },
  };
}

test("你好 stays casual without search or itinerary generation", () => {
  const decision = decideTravelAgentMode({ message: "你好" });

  assert.equal(decision.mode, "casual_chat");
  assert.equal(decision.shouldSearch, false);
  assert.equal(decision.shouldGenerateItinerary, false);
});

test("Tokyo three-day request can generate once destination and duration are known", () => {
  const decision = decideTravelAgentMode({ message: "我想去東京玩三天" });

  assert.equal(decision.mode, "generate_itinerary");
  assert.equal(decision.shouldSearch, false);
  assert.equal(decision.shouldGenerateItinerary, true);
  assert.deepEqual(decision.missingRequirements, []);
});

test("known mid-budget food preferences trigger preference confirmation", () => {
  const decision = decideTravelAgentMode({
    message: "我想去東京玩三天",
    aiContext: makeAiContext({
      budgetLevel: "medium",
      travelStyle: ["美食", "購物"],
    }),
  });

  assert.equal(decision.mode, "confirm_preferences");
  assert.match(decision.preferenceConfirmation?.prompt || "", /中等預算/);
  assert.match(decision.preferenceConfirmation?.prompt || "", /美食/);
});

test("structured preferences trigger natural confirmation copy", () => {
  const decision = decideTravelAgentMode({
    message: "我想去東京玩三天",
    aiContext: makeAiContext({
      budgetLevel: "medium",
      travelStyle: ["food", "shopping"],
      travelStyles: ["food", "shopping"],
      pace: "balanced",
    }),
  });

  assert.equal(decision.mode, "confirm_preferences");
  assert.match(decision.userFacingGuidance || "", /中等預算/);
  assert.match(decision.userFacingGuidance || "", /美食/);
  assert.match(decision.userFacingGuidance || "", /東京 3 天/);
  assert.doesNotMatch(decision.userFacingGuidance || "", /user_id|provider|debug/);
});

test("東京三天 with stale 台南 profile prefers 東京 in confirm copy", () => {
  const decision = decideTravelAgentMode({
    message: "東京三天",
    context: { destination: "台南", days: 3 },
    tripProfile: {
      destination: "台南",
      duration_days: 3,
      budget: null,
      companions: null,
      traveler_count: null,
      transportation: null,
      pace: null,
      preferences: [],
      avoid_places: [],
      notes: null,
    },
    aiContext: makeAiContext({
      budgetLevel: "medium",
      travelStyle: ["美食", "古蹟"],
      destination: "台南",
    }),
  });

  assert.equal(decision.mode, "confirm_preferences");
  assert.match(decision.preferenceConfirmation?.prompt || "", /東京/);
  assert.doesNotMatch(decision.preferenceConfirmation?.prompt || "", /台南/);
});

test("reuse preference follow-up can generate with relaxed pace", () => {
  const decision = decideTravelAgentMode({
    message: "沿用，排輕鬆一點",
    context: { destination: "東京", days: 3 },
    aiContext: makeAiContext({
      budgetLevel: "medium",
      travelStyle: ["美食", "購物"],
    }),
  });

  assert.equal(decision.mode, "generate_itinerary");
  assert.equal(decision.shouldGenerateItinerary, true);
  assert.equal(decision.preferenceConfirmation?.preferences.pace, "relaxed");
});

test("current itinerary replacement enters modify itinerary mode", () => {
  const decision = decideTravelAgentMode({
    message: "幫我把第二天秋葉原改成晴空塔",
    context: {
      destination: "東京",
      days: 3,
      itinerary: [
        { dayNumber: 2, items: [{ id: "akiba", time: "10:00", title: "秋葉原", type: "shopping" }] },
      ],
    },
  });

  assert.equal(decision.mode, "modify_itinerary");
  assert.equal(decision.shouldModifyItinerary, true);
});

test("fresh opening-hour question uses only Serper or Tavily search providers", () => {
  const decision = decideTravelAgentMode({ message: "東京晴空塔今天營業到幾點" });

  assert.equal(decision.mode, "search_travel_info");
  assert.equal(decision.shouldSearch, true);
  assert.equal(decision.searchDecision?.searchNeed, "opening_hours");
  assert.deepEqual(decision.requiredSearchProviders, ["serper", "tavily"]);
  assert.ok(!decision.requiredSearchProviders.includes("searxng" as never));
});

test("general first-time Tokyo question does not force search", () => {
  const decision = decideTravelAgentMode({ message: "你覺得東京適合第一次自由行嗎" });

  assert.ok(decision.mode === "answer_trip_question" || decision.mode === "casual_chat");
  assert.equal(decision.shouldSearch, false);
});

test("unmatched general message routes to answer_trip_question for LLM reply", () => {
  const decision = decideTravelAgentMode({ message: "今天想吃什麼" });

  assert.equal(decision.mode, "answer_trip_question");
  assert.equal(decision.userFacingGuidance, undefined);
  assert.equal(decision.debugReason, "fallback natural chat — route to LLM");
});

test("personal memory recall routes to answer_trip_question without search", () => {
  const decision = decideTravelAgentMode({ message: "我之前去過哪些地方啊" });

  assert.equal(decision.mode, "answer_trip_question");
  assert.equal(decision.shouldSearch, false);
  assert.equal(decision.debugReason, "personal memory recall");
});

test("events and route questions get specific search needs", () => {
  const events = decideTravelAgentMode({ message: "京都下週有什麼祭典" });
  assert.equal(events.shouldSearch, true);
  assert.equal(events.searchDecision?.searchNeed, "events");

  const route = decideTravelAgentMode({ message: "從淺草到晴空塔怎麼去" });
  assert.equal(route.shouldSearch, true);
  assert.equal(route.searchDecision?.searchNeed, "transportation");
  assert.deepEqual(route.requiredSearchProviders, ["serper", "tavily"]);
});
