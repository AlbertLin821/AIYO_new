import assert from "node:assert/strict";
import test from "node:test";
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
} from "@/server/services/travelPlannerService";
import type { ChatSource, TripPlanDay, TripPlanResult, TripProfile } from "@/types";

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

test("structured chat asks for travel_dates before itinerary generation when dates are missing", async () => {
  const response = await chatWithTravelAssistant({
    message: "請幫我規劃熊本行程",
    structuredTravelPlanning: true,
    tripProfile: makeStructuredProfile(),
  });

  assert.equal(response.reply.responseType, "question_card");
  assert.equal(response.reply.questionCard?.response_type, "question_card");
  assert.ok(response.reply.questionCard?.questions.some((question) => question.slot === "travel_dates"));
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

test("existing itinerary question card asks how to merge instead of output format", () => {
  const card = buildQuestionCard(
    {
      ...makeStructuredProfile(),
      plan_integration: null,
    },
    {
      destination: "熊本",
      days: 2,
      itinerary: [
        {
          dayNumber: 1,
          items: [
            { id: "item_1", time: "09:00", title: "熊本城", type: "attraction" },
          ],
        },
      ],
    },
  );

  assert.equal(card?.response_type, "question_card");
  assert.ok(card?.questions.some((question) => question.slot === "plan_integration"));
  assert.ok(card?.questions.some((question) => question.question === "是否直接加入現有行程規劃呢？"));
  assert.deepEqual(
    card?.questions.find((question) => question.slot === "plan_integration")?.options?.map((option) => option.label),
    ["直接加入", "自行加入"],
  );
  assert.ok(card?.questions.every((question) => !question.question.includes("最後用哪種形式呈現")));
});

test("budget question uses dynamic options based on trip profile instead of fixed template", () => {
  const card = buildQuestionCard({
    ...makeStructuredProfile(),
    budget: null,
    transportation: "self_drive",
    traveler_count: 2,
    companions: "couple_or_friend",
    preferences: ["food", "onsen", "shopping"],
    departure_location: "台北",
    travel_dates: null,
  });

  const budgetQuestion = card?.questions.find((question) => question.slot === "budget");
  assert.ok(budgetQuestion);
  assert.equal(budgetQuestion?.question, "熊本5天4夜的總預算大概抓多少比較合適？");
  assert.ok(budgetQuestion?.options?.length === 3);
  assert.ok(budgetQuestion?.options?.every((option) => /\d{1,3}(,\d{3})*\s*元/.test(option.label)));
  assert.ok(budgetQuestion?.options?.some((option) => option.recommended));
  assert.ok(budgetQuestion?.options?.every((option) => !["budget", "mid_range", "comfortable"].includes(option.value)));
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
  assert.equal(response.itinerarySuggestion, undefined);
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
