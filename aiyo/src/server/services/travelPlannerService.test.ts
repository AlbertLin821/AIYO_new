import assert from "node:assert/strict";
import test from "node:test";

process.env.AIYO_SKIP_LLM_PATCH = "1";
process.env.AIYO_DYNAMIC_QUESTION_CARD = "0";

import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import {
  applyQuestionAnswers,
  buildQuestionCard,
  buildTravelPlanRevisionMeta,
  chatWithTravelAssistant,
  convertTripPlanToTravelPlanWithSources,
  deriveTripDurationFromDateRange,
  isExistingItineraryInquiry,
  isTripWorkflowMessage,
  needsTravelResearch,
  resolveProposedChangesFromContext,
} from "@/server/services/travelPlannerService";
import { sanitizeDynamicQuestionCard } from "@/server/ai/validators/questionCardValidator";
import type { ChatSource, TripPlanDay, TripPlanResult, TripProfile } from "@/types";

function makeMemoryAiContext(destinations: string[]): AIContextBuildResult {
  return {
    text: "",
    promptContextText: "",
    sources: ["recent_trip_history"],
    structured: {
      recentTripCount: destinations.length,
      recentVideoCount: 0,
      appliedVideoSummaryCount: 0,
    },
    structuredContext: {
      userId: "user_1",
      preferences: {
        destinationPreferences: destinations,
      },
      recentTrips: destinations.map((destination, index) => ({
        id: `trip_${index}`,
        title: `${destination} 自由行`,
        destination,
        daysCount: 4,
        representativeItems: ["市區散步"],
        createdAt: "2026-01-01T00:00:00.000Z",
      })),
      tripChatHistory: [],
      globalChatMemory: [],
      videoInteractions: [],
      appliedVideoSummaries: [],
      memorySnippets: [],
      contextWarnings: [],
    },
    debug: {
      sources: [],
      includedSources: [],
      excludedSources: [],
      counts: {},
      limits: {},
      vectorStore: "none",
    },
  };
}

function makeStructuredProfile(): TripProfile {
  return {
    destination: "熊本",
    duration_days: 5,
    duration_nights: 4,
    departure_location: "台北",
    travel_dates: null,
    companions: "couple_or_friend",
    traveler_count: 2,
    budget: "mid_range",
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: ["food", "onsen"],
    transportation: "public_transport",
    accommodation: null,
    visited_before: [],
    avoid_places: [],
    dietary_restrictions: [],
    disliked_activities: [],
    pace: "relaxed",
    plan_integration: "direct_merge",
  };
}

test("structured chat generates itinerary when destination and duration are already complete", async () => {
  const response = await chatWithTravelAssistant({
    message: "請幫我規劃熊本行程",
    structuredTravelPlanning: true,
    tripProfile: makeStructuredProfile(),
  });

  assert.equal(response.reply.responseType, "travel_plan");
  assert.ok(response.reply.travelPlan);
});

test("travel chat retries once when the first compose request times out", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    if (callCount === 1) {
      const abortError = new Error("aborted");
      abortError.name = "AbortError";
      throw abortError;
    }
    return new Response(
      JSON.stringify({
        message: {
          content: JSON.stringify({
            replyText: "已完成重試回覆",
            proposedChanges: [],
          }),
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const response = await chatWithTravelAssistant({
      message: "你覺得東京適合第一次自由行嗎",
      context: { destination: "東京" },
    });
    assert.equal(callCount, 2);
    assert.equal(response.reply.responseType, "text_message");
    assert.equal(response.reply.content, "已完成重試回覆");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("travel chat returns timeout fallback text after retry exhaustion", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    throw abortError;
  };

  try {
    const response = await chatWithTravelAssistant({
      message: "你覺得東京適合第一次自由行嗎",
      context: { destination: "東京" },
    });
    assert.equal(callCount, 2);
    assert.equal(response.reply.responseType, "text_message");
    assert.equal(
      response.reply.content,
      "我先保留目前的行程脈絡；你可以再補充想調整的地點、天數或預算，我會用更精簡的查詢重新規劃。",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("personal memory recall with no stored data returns guidance without heavy compose", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: { content: "should not be used" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await chatWithTravelAssistant({
      message: "我之前去過哪些地方啊",
    });
    assert.equal(callCount, 0);
    assert.equal(response.travelAgentDecision?.debugReason, "personal memory recall");
    assert.match(response.reply.content, /還沒有記錄/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("personal memory recall uses lightweight LLM polish when memory exists", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    return new Response(JSON.stringify({ message: { content: "你過去去過京都和大阪，偏好美食與寺廟。" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await chatWithTravelAssistant({
      message: "我之前去過哪些地方啊",
      aiContext: makeMemoryAiContext(["京都", "大阪"]),
    });
    assert.equal(callCount, 1);
    assert.equal(response.travelAgentDecision?.debugReason, "personal memory recall");
    assert.match(response.reply.content, /京都/);
    assert.match(response.reply.content, /大阪/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("personal memory recall timeout falls back to deterministic destination list", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    throw abortError;
  };

  try {
    const response = await chatWithTravelAssistant({
      message: "我之前去過哪些地方啊",
      aiContext: makeMemoryAiContext(["京都", "大阪"]),
    });
    assert.equal(callCount, 1);
    assert.match(response.reply.content, /京都/);
    assert.match(response.reply.content, /大阪/);
    assert.doesNotMatch(response.reply.content, /重新規劃/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("travel chat does not retry non-timeout ollama errors", async () => {
  const originalFetch = globalThis.fetch;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount += 1;
    return new Response("server error", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  };

  try {
    await assert.rejects(() =>
      chatWithTravelAssistant({
        message: "你覺得東京適合第一次自由行嗎",
        context: { destination: "東京" },
      }),
    );
    assert.equal(callCount, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("date range derives inclusive trip days without adding extra days", () => {
  const derived = deriveTripDurationFromDateRange({
    start: "2026-07-01",
    end: "2026-07-05",
  });

  assert.deepEqual(derived, {
    start: "2026-07-01",
    end: "2026-07-05",
    days: 5,
    nights: 4,
  });
});

test("travel_dates answers override stale duration to the actual inclusive span", () => {
  const profile = applyQuestionAnswers(
    {
      ...makeStructuredProfile(),
      duration_days: 8,
      duration_nights: 7,
      travel_dates: null,
    },
    [
      {
        slot: "travel_dates",
        value: {
          start: "2026-07-01",
          end: "2026-07-05",
        },
      },
    ],
  );

  assert.equal(profile.duration_days, 5);
  assert.equal(profile.duration_nights, 4);
  assert.deepEqual(profile.travel_dates, {
    start: "2026-07-01",
    end: "2026-07-05",
  });
});

test("question card skips destination when conversation already mentions Kumamoto", () => {
  const card = buildQuestionCard(
    {
      ...makeStructuredProfile(),
      destination: null,
      duration_days: null,
      duration_nights: null,
      preferences: [],
      pace: null,
    },
    { destination: "熊本", days: undefined },
  );
  assert.equal(card?.response_type, "question_card");
  assert.ok(card?.questions.some((question) => question.slot === "duration_days"));
  assert.equal(
    card?.questions.some((question) => question.slot === "destination"),
    false,
  );
});

test("question card asks for companions when destination and duration are known", () => {
  const card = buildQuestionCard({
    ...makeStructuredProfile(),
    destination: "熊本",
    duration_days: 5,
    duration_nights: 4,
    companions: null,
    traveler_count: null,
    preferences: [],
    pace: null,
  });
  assert.equal(card?.response_type, "question_card");
  assert.ok(card?.questions.some((question) => question.slot === "companions"));
  assert.equal(
    card?.questions.some((question) => question.slot === "preferences"),
    false,
  );
});

test("question card asks for preferences after companions are known", () => {
  const card = buildQuestionCard({
    ...makeStructuredProfile(),
    destination: "熊本",
    duration_days: 5,
    duration_nights: 4,
    companions: "couple_or_friend",
    traveler_count: 2,
    preferences: [],
    pace: null,
  });
  assert.equal(card?.response_type, "question_card");
  assert.ok(card?.questions.some((question) => question.slot === "preferences"));
  assert.equal(card?.questions[0]?.type, "multi_choice");
});

test("applyQuestionAnswers maps traveler_count to companions", () => {
  const profile = applyQuestionAnswers(makeStructuredProfile(), [
    { slot: "traveler_count", value: "3" },
  ]);
  assert.equal(profile.traveler_count, 3);
  assert.equal(profile.companions, "small_group");
});

test("applyQuestionAnswers maps companions to traveler_count", () => {
  const profile = applyQuestionAnswers(
    { ...makeStructuredProfile(), companions: null, traveler_count: null },
    [{ slot: "companions", value: "solo" }],
  );
  assert.equal(profile.companions, "solo");
  assert.equal(profile.traveler_count, 1);
});

test("question card becomes null after core planning fields are complete", () => {
  const card = buildQuestionCard(makeStructuredProfile());
  assert.equal(card, null);
});

test("dynamic question card sanitizer keeps AI wording while preserving parseable values", () => {
  const fallback = {
    response_type: "question_card" as const,
    title: "先幫我了解你的熊本旅遊需求，這樣行程會更貼合你",
    questions: [
      {
        slot: "preferences" as const,
        type: "multi_choice" as const,
        question: "你想讓熊本行程更偏向哪幾種體驗？",
        options: [
          { label: "阿蘇自然景觀", value: "nature", recommended: true },
          { label: "馬肉、拉麵等在地美食", value: "food" },
        ],
      },
      {
        slot: "pace" as const,
        type: "single_choice" as const,
        question: "每天安排要偏慢還是偏滿？",
        options: [
          { label: "慢慢玩，保留咖啡和休息時間", value: "relaxed", recommended: true },
          { label: "行程排滿，景點多一點", value: "intensive" },
        ],
      },
    ],
    action: { label: "繼續", shortcut: "Enter" },
  };

  const card = sanitizeDynamicQuestionCard(
    {
      response_type: "question_card",
      eyebrow: "依你剛剛說的調整",
      title: "熊本這趟先抓出你最在意的玩法",
      description: "我會用這幾個答案決定景點密度和住宿區域。",
      questions: [
        {
          slot: "preferences",
          type: "multi_choice",
          question: "你想讓熊本行程更偏向哪幾種體驗？",
          helperText: "可複選，之後路線會依這些偏好排序。",
          options: [
            { label: "阿蘇自然景觀", value: "nature", recommended: true },
            { label: "馬肉、拉麵等在地美食", value: "food" },
          ],
        },
        {
          slot: "pace",
          type: "single_choice",
          question: "每天安排要偏慢還是偏滿？",
          options: [
            { label: "慢慢玩，保留咖啡和休息時間", value: "relaxed", recommended: true },
            { label: "行程排滿，景點多一點", value: "intensive" },
            { label: "不合法值會被丟掉", value: "packed" },
          ],
        },
      ],
      action: { label: "用這樣規劃", shortcut: "Enter" },
    },
    fallback,
  );

  assert.equal(card?.eyebrow, "依你剛剛說的調整");
  assert.equal(card?.questions[0]?.question, "你想讓熊本行程更偏向哪幾種體驗？");
  assert.deepEqual(
    card?.questions.find((question) => question.slot === "pace")?.options?.map((option) => option.value),
    ["relaxed", "intensive"],
  );
  assert.equal(card?.action?.label, "用這樣規劃");
});

test("東基 speech typo normalizes to Tokyo in required question card copy", () => {
  const card = buildQuestionCard({
    ...makeStructuredProfile(),
    destination: "東基",
    duration_days: null,
    duration_nights: null,
  });

  assert.equal(card?.response_type, "question_card");
  assert.ok(card?.questions.some((question) => question.slot === "duration_days"));
});

test("question card includes destination and duration slots when both missing", () => {
  const card = buildQuestionCard({
    ...makeStructuredProfile(),
    destination: null,
    duration_days: null,
    duration_nights: null,
  });
  assert.equal(card?.response_type, "question_card");
  assert.ok(card?.questions.some((question) => question.slot === "destination"));
  assert.ok(card?.questions.some((question) => question.slot === "duration_days"));
});

test("needsTravelResearch stays false for current itinerary queries and modifications", () => {
  const context = {
    destination: "熊本",
    itinerary: [
      {
        dayNumber: 1,
        items: [{ id: "item_1", time: "09:00", title: "熊本城", type: "attraction" as const }],
      },
    ],
  };

  assert.equal(
    needsTravelResearch({
      message: "我現在這個行程有哪些地點？",
      context,
    }),
    false,
  );
  assert.equal(
    needsTravelResearch({
      message: "把第二天下午改成阿蘇火山",
      context,
    }),
    false,
  );
});

test("needsTravelResearch turns on for recommendation and video inspiration requests", () => {
  const context = {
    destination: "熊本",
    itinerary: [],
  };

  assert.equal(
    needsTravelResearch({
      message: "幫我找熊本適合晚上去的地方",
      context,
    }),
    true,
  );
  assert.equal(
    needsTravelResearch({
      message: "熊本三天兩夜行程可以怎麼排？",
      context,
    }),
    true,
  );
  assert.equal(
    needsTravelResearch({
      message: "幫我找幾個熊本旅遊影片當靈感來源",
      context,
    }),
    true,
  );
});

test("existing itinerary questions bypass the structured planning template", () => {
  const context = {
    destination: "熊本",
    days: 1,
    itinerary: [
      {
        dayNumber: 1,
        items: [
          { id: "item_1", time: "09:00", title: "熊本城", type: "attraction" as const },
        ],
      },
    ],
  };

  assert.equal(
    isExistingItineraryInquiry({
      message: "這個行程裡面有哪些活動？",
      context,
    }),
    true,
  );
  assert.equal(
    isExistingItineraryInquiry({
      message: "幫我在這個行程新增一個晚餐",
      context,
    }),
    false,
  );
  assert.equal(
    isExistingItineraryInquiry({
      message: "這個行程有甚麼地點",
      context,
    }),
    true,
  );
  assert.equal(
    isTripWorkflowMessage({
      message: "這個行程有甚麼地點",
      context,
      tripProfile: makeStructuredProfile(),
    }),
    false,
  );
});

test("existing itinerary location questions answer from context without model planning", async () => {
  const response = await chatWithTravelAssistant({
    message: "查看我現在有哪些地點在這個行程",
    structuredTravelPlanning: true,
    context: {
      destination: "熊本",
      days: 1,
      itinerary: [
        {
          dayNumber: 1,
          items: [
            {
              id: "item_1",
              time: "09:00",
              title: "熊本城",
              type: "attraction",
              location: {
                name: "熊本城",
                lat: 32.8062,
                lng: 130.7058,
                description: "熊本代表景點",
                address: "熊本市中央區本丸1-1",
              },
            },
            { id: "item_2", time: "12:00", title: "午餐", type: "restaurant" },
          ],
        },
      ],
    },
  });

  assert.equal(response.reply.responseType, "text_message");
  assert.match(response.reply.content, /熊本\s*目前行程有這些地點/);
  assert.match(response.reply.content, /Day 1 09:00：熊本城/);
  assert.match(response.reply.content, /Day 1 12:00：午餐/);
  assert.equal(response.reply.questionCard, undefined);
});

test("existing itinerary replacement request becomes a targeted proposed change", async () => {
  const response = await chatWithTravelAssistant({
    message: "把第三天的 BIFF 廣場 改成 海東龍宮寺，其他安排先維持不變。",
    structuredTravelPlanning: true,
    forceStructuredRevision: true,
    context: {
      destination: "釜山",
      days: 5,
      itinerary: [
        {
          dayNumber: 3,
          items: [
            { id: "item_d3_1", time: "09:00", title: "青沙浦", type: "attraction" },
            { id: "item_d3_2", time: "15:00", title: "BIFF 廣場", type: "attraction" },
          ],
        },
      ],
    },
  });

  assert.equal(response.reply.responseType, "text_message");
  assert.match(response.reply.content, /已將第 3 天的「BIFF 廣場」調整為「海東龍宮寺」/);
  assert.deepEqual(response.proposedChanges, [
    {
      type: "update_itinerary_item",
      day: 3,
      itemId: "item_d3_2",
      targetTitle: "BIFF 廣場",
      title: "海東龍宮寺",
      locationName: "海東龍宮寺",
      reason: "依照使用者要求，將 BIFF 廣場 替換為 海東龍宮寺",
      source: "ai-chat",
    },
  ]);
  assert.equal(response.assistantActions?.[0]?.type, "itinerary.update_item");
  assert.deepEqual(response.assistantActions?.[0]?.payload, {
    dayId: "day-3",
    itemId: "item_d3_2",
    patch: {
      title: "海東龍宮寺",
      location: "海東龍宮寺",
      startTime: undefined,
      notes: undefined,
    },
  });
  assert.equal(response.itinerarySuggestion, undefined);
});

test("assistant action updates second day Akihabara to Skytree while keeping legacy proposedChanges", async () => {
  const response = await chatWithTravelAssistant({
    message: "幫我把第二天的秋葉原改成晴空塔",
    structuredTravelPlanning: true,
    context: {
      destination: "東京",
      days: 3,
      itinerary: [
        { dayNumber: 2, items: [{ id: "d2-a", time: "14:00", title: "秋葉原", type: "attraction" as const }] },
      ],
    },
  });

  assert.equal(response.assistantActions?.[0]?.type, "itinerary.update_item");
  assert.equal(response.assistantActions?.[0]?.payload.itemId, "d2-a");
  assert.equal(response.proposedChanges?.[0]?.type, "update_itinerary_item");
});

test("assistant action supports reordering a day", async () => {
  const response = await chatWithTravelAssistant({
    message: "把第二天順序改成淺草、晴空塔、上野",
    structuredTravelPlanning: true,
    context: {
      destination: "東京",
      days: 3,
      itinerary: [
        {
          dayNumber: 2,
          items: [
            { id: "ueno", time: "09:00", title: "上野", type: "attraction" as const },
            { id: "asakusa", time: "11:00", title: "淺草", type: "attraction" as const },
            { id: "skytree", time: "17:00", title: "晴空塔", type: "attraction" as const },
          ],
        },
      ],
    },
  });

  assert.equal(response.assistantActions?.[0]?.type, "itinerary.reorder_items");
  assert.deepEqual(response.assistantActions?.[0]?.payload.orderedItemIds, ["asakusa", "skytree", "ueno"]);
});

test("assistant action keeps relaxed day changes within action limit", async () => {
  const response = await chatWithTravelAssistant({
    message: "把第三天改成輕鬆一點",
    structuredTravelPlanning: true,
    context: {
      destination: "東京",
      days: 3,
      itinerary: [
        {
          dayNumber: 3,
          items: [
            { id: "a", time: "09:00", title: "A", type: "attraction" as const },
            { id: "b", time: "11:00", title: "B", type: "attraction" as const },
            { id: "c", time: "13:00", title: "C", type: "attraction" as const },
          ],
        },
      ],
    },
  });

  assert.ok((response.assistantActions?.length ?? 0) > 0);
  assert.ok((response.assistantActions?.length ?? 0) <= 6);
  assert.equal(response.assistantActions?.[0]?.type, "itinerary.update_item");
});

test("map focus assistant action does not emit persistence proposedChanges", async () => {
  const response = await chatWithTravelAssistant({
    message: "地圖幫我定位到清水寺",
    structuredTravelPlanning: true,
    context: { destination: "京都", days: 1, itinerary: [] },
  });

  assert.equal(response.assistantActions?.[0]?.type, "map.focus_location");
  assert.equal(response.proposedChanges?.length ?? 0, 0);
});

test("existing itinerary delete whole day request becomes remove_itinerary_day proposed change", async () => {
  const context = {
    destination: "釜山",
    days: 5,
    itinerary: [
      { dayNumber: 1, items: [{ id: "d1", time: "09:00", title: "海雲台", type: "attraction" as const }] },
      { dayNumber: 2, items: [{ id: "d2", time: "09:00", title: "甘川文化村", type: "attraction" as const }] },
      { dayNumber: 3, items: [{ id: "d3", time: "09:00", title: "札嘎其市場", type: "attraction" as const }] },
      { dayNumber: 4, items: [{ id: "d4", time: "09:00", title: "太宗台", type: "attraction" as const }] },
      { dayNumber: 5, items: [{ id: "d5", time: "09:00", title: "機場返程", type: "transport" as const }] },
    ],
  };

  for (const message of [
    "幫我刪掉第五天的行程",
    "刪除第5天",
    "把第五天移除",
    "取消第五天的安排",
    "最后一天不要了",
  ]) {
    const response = await chatWithTravelAssistant({
      message,
      structuredTravelPlanning: true,
      context,
    });

    assert.equal(response.reply.responseType, "text_message", message);
    assert.match(response.reply.content, /已刪除第 5 天行程/, message);
    assert.deepEqual(
      response.proposedChanges,
      [
        {
          type: "remove_itinerary_day",
          day: 5,
          reason: "依照使用者要求刪除整天行程",
          source: "ai-chat",
        },
      ],
      message,
    );
  }
});

test("existing itinerary delete item request respects the requested day", async () => {
  const response = await chatWithTravelAssistant({
    message: "幫我刪掉地7天的熊本城",
    structuredTravelPlanning: true,
    context: {
      destination: "熊本",
      days: 7,
      itinerary: [
        { dayNumber: 2, items: [{ id: "d2", time: "09:00", title: "熊本城", type: "attraction" as const }] },
        { dayNumber: 7, items: [{ id: "d7", time: "10:00", title: "熊本城", type: "attraction" as const }] },
      ],
    },
  });

  assert.equal(response.reply.responseType, "text_message");
  assert.match(response.reply.content, /已從第 7 天移除「熊本城」/);
  assert.deepEqual(response.proposedChanges, [
    {
      type: "remove_itinerary_item",
      day: 7,
      itemId: "d7",
      targetTitle: "熊本城",
      reason: "依照使用者要求，自第 7 天移除此行程項目",
      source: "ai-chat",
    },
  ]);
});

test("existing itinerary delete item request reports missing item on requested day", async () => {
  const response = await chatWithTravelAssistant({
    message: "刪掉第7天的熊本城",
    structuredTravelPlanning: true,
    context: {
      destination: "熊本",
      days: 7,
      itinerary: [
        { dayNumber: 2, items: [{ id: "d2", time: "09:00", title: "熊本城", type: "attraction" as const }] },
        { dayNumber: 7, items: [{ id: "d7", time: "10:00", title: "水前寺成趣園", type: "attraction" as const }] },
      ],
    },
  });

  assert.equal(response.reply.responseType, "text_message");
  assert.match(response.reply.content, /第 7 天找不到「熊本城」/);
  assert.equal(response.proposedChanges?.length ?? 0, 0);
});

test("resolveProposedChangesFromContext prefers explicit day in user message over wrong model day", () => {
  const context = {
    destination: "熊本",
    days: 7,
    itinerary: [
      { dayNumber: 2, items: [{ id: "d2", time: "09:00", title: "熊本城", type: "attraction" as const }] },
      { dayNumber: 7, items: [{ id: "d7", time: "10:00", title: "熊本城", type: "attraction" as const }] },
    ],
  };

  const { resolved, issues } = resolveProposedChangesFromContext({
    userMessage: "幫我刪掉地7天的熊本城",
    context,
    changes: [
      {
        type: "remove_itinerary_item",
        day: 2,
        targetTitle: "熊本城",
        source: "ai-chat",
      },
    ],
  });

  assert.equal(issues.length, 0);
  assert.deepEqual(resolved, [
    {
      type: "remove_itinerary_item",
      day: 7,
      itemId: "d7",
      targetTitle: "熊本城",
      reason: "依照使用者要求，自第 7 天移除此行程項目",
      source: "ai-chat",
    },
  ]);
});

test("structured planning template only starts for explicit planning intent", () => {
  const context = {
    destination: "熊本",
    days: 1,
    itinerary: [
      {
        dayNumber: 1,
        items: [
          { id: "item_1", time: "09:00", title: "熊本城", type: "attraction" as const },
        ],
      },
    ],
  };

  assert.equal(
    isTripWorkflowMessage({
      message: "這個行程適合帶長輩嗎？",
      tripProfile: makeStructuredProfile(),
    }),
    false,
  );
  assert.equal(
    isTripWorkflowMessage({
      message: "請幫我規劃熊本 6 天 5 夜行程",
      tripProfile: makeStructuredProfile(),
    }),
    true,
  );
  assert.equal(
    isTripWorkflowMessage({
      message: "幫我把熊本城改成水前寺成趣園",
      context,
      tripProfile: makeStructuredProfile(),
    }),
    false,
  );
});

test("buildTravelPlanRevisionMeta summarizes changes against previous itinerary", () => {
  const previousDays: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        { id: "old_1", time: "09:00", title: "熊本車站", type: "transport" },
        { id: "old_2", time: "10:00", title: "熊本城", type: "attraction" },
      ],
    },
  ];
  const nextDays: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        { id: "new_1", time: "09:00", title: "熊本車站", type: "transport" },
        { id: "new_2", time: "11:00", title: "黑川溫泉", type: "attraction" },
      ],
    },
  ];

  const meta = buildTravelPlanRevisionMeta({
    previousDays,
    nextDays,
    profile: {
      ...makeStructuredProfile(),
      transportation: "self_drive",
      pace: "relaxed",
      travel_dates: { start: "2026-10-01", end: "2026-10-05" },
    },
  });

  assert.ok(meta);
  assert.match(meta!.revision_id, /^rev_/);
  assert.match(meta!.revised_from, /^plan_/);
  assert.equal(meta!.based_on_existing_itinerary, true);
  assert.deepEqual(meta!.changed_days, ["Day 1"]);
  assert.ok(meta!.change_summary.some((item) => item.includes("自駕")));
  assert.ok(meta!.change_summary.some((item) => item.includes("新增重點")));
  assert.ok(meta!.change_summary.some((item) => item.includes("移除或替換")));
  assert.deepEqual(meta!.added_items, [
    { day: "Day 1", time: "11:00", title: "黑川溫泉" },
  ]);
  assert.deepEqual(meta!.removed_items, [
    { day: "Day 1", time: "10:00", title: "熊本城" },
  ]);
  assert.deepEqual(meta!.moved_items, []);
  assert.deepEqual(meta!.retimed_items, []);
});

test("buildTravelPlanRevisionMeta classifies moved and retimed items without treating them as add/remove", () => {
  const previousDays: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        { id: "old_1", time: "09:00", title: "熊本城", type: "attraction" },
        { id: "old_2", time: "13:00", title: "阿蘇山", type: "attraction" },
      ],
    },
  ];
  const nextDays: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        { id: "new_1", time: "10:30", title: "熊本城", type: "attraction" },
      ],
    },
    {
      dayNumber: 2,
      items: [
        { id: "new_2", time: "15:00", title: "阿蘇山", type: "attraction" },
      ],
    },
  ];

  const meta = buildTravelPlanRevisionMeta({
    previousDays,
    nextDays,
    profile: {
      ...makeStructuredProfile(),
      travel_dates: { start: "2026-10-01", end: "2026-10-05" },
    },
  });

  assert.ok(meta);
  assert.deepEqual(meta!.retimed_items, [
    { day: "Day 1", title: "熊本城", from_time: "09:00", to_time: "10:30" },
  ]);
  assert.deepEqual(meta!.moved_items, [
    { title: "阿蘇山", from_day: "Day 1", to_day: "Day 2", from_time: "13:00", to_time: "15:00" },
  ]);
  assert.deepEqual(meta!.added_items, []);
  assert.deepEqual(meta!.removed_items, []);
});

test("convertTripPlanToTravelPlanWithSources preserves multi-provider sources and builds source-driven alerts", () => {
  const plan: TripPlanResult = {
    summary: "熊本五天四夜",
    days: [
      {
        dayNumber: 1,
        theme: "熊本市區",
        summary: "熊本城與市區散步",
        items: [
          {
            id: "item_1",
            dayNumber: 1,
            time: "09:00",
            title: "熊本城",
            type: "attraction",
            transport: "熊本電鐵一日券可達",
            notes: "官方公告顯示部分動線調整。",
            source: "ai",
          },
          {
            id: "item_2",
            dayNumber: 1,
            time: "12:00",
            title: "勝烈亭",
            type: "restaurant",
            notes: "YouTube 在地美食影片常見推薦。",
            source: "ai",
          },
        ],
      },
    ],
  };
  const profile: TripProfile = {
    ...makeStructuredProfile(),
    travel_dates: { start: "2026-10-01", end: "2026-10-05" },
  };
  const sources: Record<string, ChatSource> = {
    weather_001: {
      source_id: "weather_001",
      type: "weather",
      provider: "open-meteo",
      title: "熊本 天氣預報 2026-10-01",
      url: "https://open-meteo.com/forecast",
      domain: "open-meteo.com",
      snippet: "2026-10-01：多雲短暫雨，降雨機率最高約 70%",
      preview_text: "2026-10-01：多雲短暫雨，降雨機率最高約 70%",
      retrieved_at: new Date().toISOString(),
      reliability: "high",
    },
    official_001: {
      source_id: "official_001",
      type: "official",
      provider: "kumamoto-city",
      title: "熊本市官方活動與交通公告 2026-10-01",
      url: "https://www.city.kumamoto.jp/event",
      domain: "city.kumamoto.jp",
      snippet: "2026-10-01 熊本城周邊祭典，部分道路封閉與交通管制。",
      preview_text: "2026-10-01 熊本城周邊祭典，部分道路封閉與交通管制。",
      retrieved_at: new Date().toISOString(),
      reliability: "high",
    },
    yt_001: {
      source_id: "yt_001",
      type: "youtube",
      provider: "Travel Lab",
      title: "熊本美食散步 vlog",
      url: "https://www.youtube.com/watch?v=abc123",
      domain: "youtube.com",
      snippet: "勝烈亭與熊本市區散步美食推薦。",
      preview_text: "勝烈亭與熊本市區散步美食推薦。",
      retrieved_at: new Date().toISOString(),
      reliability: "high",
    },
    web_001: {
      source_id: "web_001",
      type: "web",
      provider: "search",
      title: "熊本電車交通整理",
      url: "https://example.com/kumamoto-transit",
      domain: "example.com",
      snippet: "熊本電鐵一日券可達熊本城周邊景點。",
      preview_text: "熊本電鐵一日券可達熊本城周邊景點。",
      retrieved_at: new Date().toISOString(),
      reliability: "medium",
    },
  };

  const response = convertTripPlanToTravelPlanWithSources(plan, profile, sources);

  assert.ok(response.sources);
  assert.equal(response.sources?.weather_001.type, "weather");
  assert.equal(response.sources?.official_001.type, "official");
  assert.equal(response.sources?.yt_001.type, "youtube");
  assert.equal(response.sources?.web_001.type, "web");
  assert.equal(response.weather_alerts[0]?.citations?.[0], "weather_001");
  assert.match(response.weather_alerts[0]?.message || "", /2026-10-01|降雨機率偏高/);
  assert.equal(response.event_alerts[0]?.citations?.[0], "official_001");
  assert.match(response.event_alerts[0]?.message || "", /官方提醒/);
  assert.equal(response.days[0]?.transportation[0]?.text, "熊本電鐵一日券可達");
  assert.ok(response.days[0]?.spots[0]?.citations?.includes("official_001"));
  assert.ok(response.days[0]?.food_recommendations[0]?.citations?.includes("yt_001"));
  assert.ok(response.days[0]?.transportation[0]?.citations?.includes("web_001"));
  assert.ok(!(response.summary_table[0]?.citations || []).includes("yt_001"));
});

test("convertTripPlanToTravelPlanWithSources normalizes transport enum labels for display", () => {
  const response = convertTripPlanToTravelPlanWithSources(
    {
      summary: "測試",
      days: [
        {
          dayNumber: 1,
          items: [
            {
              id: "item_1",
              dayNumber: 1,
              time: "09:00",
              title: "熊本城",
              type: "attraction",
              transport: "public_transport",
              source: "ai",
            },
          ],
        },
      ],
    },
    {
      ...makeStructuredProfile(),
      travel_dates: { start: "2026-10-01", end: "2026-10-05" },
    },
    {},
  );

  assert.equal(response.days[0]?.transportation[0]?.text, "大眾運輸");
});
