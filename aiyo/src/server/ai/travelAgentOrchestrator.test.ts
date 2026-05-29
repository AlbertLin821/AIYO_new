import assert from "node:assert/strict";
import test from "node:test";

import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { decideTravelAgentMode } from "@/server/ai/travelAgentOrchestrator";

function makeAiContext(preferences: NonNullable<AIContextBuildResult["structured"]["preferences"]>): AIContextBuildResult {
  return {
    text: "[使用者偏好摘要]\n預算：中等預算\n旅遊風格：美食、購物",
    sources: ["user_preferences"],
    structured: {
      preferences,
      recentTripCount: 1,
      recentVideoCount: 0,
      appliedVideoSummaryCount: 0,
    },
    debug: {
      sources: ["user_preferences"],
      counts: {},
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

test("Tokyo three-day request collects requirements before generating", () => {
  const decision = decideTravelAgentMode({ message: "我想去東京玩三天" });

  assert.equal(decision.mode, "collect_requirements");
  assert.equal(decision.shouldSearch, false);
  assert.equal(decision.shouldGenerateItinerary, false);
  assert.ok(decision.missingRequirements.includes("預算"));
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
  assert.deepEqual(decision.requiredSearchProviders, ["serper", "tavily"]);
  assert.ok(!decision.requiredSearchProviders.includes("searxng" as never));
});

test("general first-time Tokyo question does not force search", () => {
  const decision = decideTravelAgentMode({ message: "你覺得東京適合第一次自由行嗎" });

  assert.ok(decision.mode === "answer_trip_question" || decision.mode === "casual_chat");
  assert.equal(decision.shouldSearch, false);
});
