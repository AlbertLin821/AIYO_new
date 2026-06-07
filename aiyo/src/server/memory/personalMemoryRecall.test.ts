import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPersonalMemoryBundle,
  formatPersonalMemoryDeterministicReply,
  isPersonalMemoryRecallIntent,
  isUserFacingMemorySnippet,
} from "@/server/memory/personalMemoryRecall";
import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";

function makeAiContextWithTrips(destinations: string[]): AIContextBuildResult {
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

function makeEmptyAiContext(): AIContextBuildResult {
  return {
    text: "",
    promptContextText: "",
    sources: [],
    structured: {
      recentTripCount: 0,
      recentVideoCount: 0,
      appliedVideoSummaryCount: 0,
    },
    structuredContext: {
      userId: "user_1",
      preferences: {
        destinationPreferences: [],
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
      sources: [],
      includedSources: [],
      excludedSources: [],
      counts: {},
      limits: {},
      vectorStore: "none",
    },
  };
}

const LEAKED_PROMPT_CONTEXT = [
  "[目前輸入與行程]",
  "user: 幫我規劃熊本 5 天",
  "[近期全域聊天摘要]",
  "assistant: 好的，我來幫你整理",
  "[近期旅遊影片互動]",
  "watch: https://example.com/video/123",
  "analyze: 熊本城與阿蘇",
  "[Context 限制提醒]",
  "已省略部分內容",
].join("\n");

test("isPersonalMemoryRecallIntent matches personal history questions", () => {
  assert.equal(isPersonalMemoryRecallIntent("我之前去過哪些地方啊"), true);
  assert.equal(isPersonalMemoryRecallIntent("你還記得我的偏好嗎"), true);
  assert.equal(isPersonalMemoryRecallIntent("我的旅行紀錄有哪些"), true);
});

test("isPersonalMemoryRecallIntent excludes active planning requests", () => {
  assert.equal(isPersonalMemoryRecallIntent("幫我規劃東京 5 天"), false);
  assert.equal(isPersonalMemoryRecallIntent("我想安排京都行程"), false);
});

test("buildPersonalMemoryBundle deduplicates destinations from multiple sources", () => {
  const bundle = buildPersonalMemoryBundle({
    aiContext: makeAiContextWithTrips(["京都", "大阪"]),
    memoryContext: "1. 使用者喜歡京都的寺廟",
    tripProfile: {
      destination: null,
      duration_days: null,
      duration_nights: null,
      departure_location: null,
      travel_dates: null,
      companions: null,
      traveler_count: null,
      budget: null,
      special_population: {
        has_elderly: false,
        has_children: false,
        mobility_issue: false,
      },
      preferences: [],
      transportation: null,
      accommodation: null,
      visited_before: ["京都"],
      avoid_places: [],
      dietary_restrictions: [],
      disliked_activities: [],
      pace: null,
      plan_integration: null,
    },
  });

  assert.equal(bundle.hasData, true);
  assert.deepEqual(bundle.destinations, ["京都", "大阪"]);
  assert.ok(bundle.snippets.some((snippet) => snippet.includes("寺廟")));
});

test("formatPersonalMemoryDeterministicReply handles empty bundle", () => {
  const reply = formatPersonalMemoryDeterministicReply({
    destinations: [],
    snippets: [],
    recentTrips: [],
    hasData: false,
  });

  assert.match(reply, /還沒有記錄/);
});

test("formatPersonalMemoryDeterministicReply lists known destinations", () => {
  const reply = formatPersonalMemoryDeterministicReply(
    buildPersonalMemoryBundle({
      aiContext: makeAiContextWithTrips(["京都", "大阪"]),
    }),
  );

  assert.match(reply, /京都/);
  assert.match(reply, /大阪/);
});

test("formatPersonalMemoryDeterministicReply includes representative itinerary places for matched trip queries", () => {
  const aiContext = makeAiContextWithTrips(["熊本"]);
  aiContext.structuredContext.recentTrips[0]!.representativeItems = ["熊本城", "草千里之濱", "黑亭"];

  const reply = formatPersonalMemoryDeterministicReply(
    buildPersonalMemoryBundle({
      aiContext,
    }),
    "我之前熊本行程去過哪些地方",
  );

  assert.match(reply, /熊本城/);
  assert.match(reply, /草千里之濱/);
  assert.match(reply, /黑亭/);
});

test("isUserFacingMemorySnippet rejects internal prompt and chat leak patterns", () => {
  assert.equal(isUserFacingMemorySnippet("[近期全域聊天摘要]"), false);
  assert.equal(isUserFacingMemorySnippet("assistant: 好的"), false);
  assert.equal(isUserFacingMemorySnippet("watch: https://example.com"), false);
  assert.equal(isUserFacingMemorySnippet("Context 限制提醒"), false);
  assert.equal(isUserFacingMemorySnippet("已省略部分內容"), false);
  assert.equal(isUserFacingMemorySnippet("使用者喜歡京都的寺廟"), true);
});

test("buildPersonalMemoryBundle ignores leaked promptContext when no real travel data", () => {
  const bundle = buildPersonalMemoryBundle({
    aiContext: makeEmptyAiContext(),
    memoryContext: LEAKED_PROMPT_CONTEXT,
  });

  assert.equal(bundle.hasData, false);
  assert.deepEqual(bundle.snippets, []);
  assert.deepEqual(bundle.destinations, []);

  const reply = formatPersonalMemoryDeterministicReply(bundle);
  assert.match(reply, /還沒有記錄/);
  assert.doesNotMatch(reply, /近期全域聊天摘要/);
  assert.doesNotMatch(reply, /watch:/);
});

test("buildPersonalMemoryBundle ignores non-mem0 structured snippets", () => {
  const aiContext = makeEmptyAiContext();
  aiContext.structuredContext.globalChatMemory = [
    { role: "user", content: "我去過台北", createdAt: "2026-01-01T00:00:00.000Z" },
  ];
  aiContext.structuredContext.memorySnippets = [
    { content: "使用者曾提到台北", source: "global_chat", relevance: 0.9 },
  ];

  const bundle = buildPersonalMemoryBundle({
    aiContext,
    memoryContext: LEAKED_PROMPT_CONTEXT,
  });

  assert.equal(bundle.hasData, false);
});

test("buildPersonalMemoryBundle accepts mem0 memories without leaking section headers", () => {
  const bundle = buildPersonalMemoryBundle({
    aiContext: makeAiContextWithTrips(["京都"]),
    mem0Memories: ["使用者偏好安靜的寺廟與早午餐"],
    memoryContext: LEAKED_PROMPT_CONTEXT,
  });

  assert.equal(bundle.hasData, true);
  assert.deepEqual(bundle.destinations, ["京都"]);
  assert.deepEqual(bundle.snippets, ["使用者偏好安靜的寺廟與早午餐"]);

  const reply = formatPersonalMemoryDeterministicReply(bundle);
  assert.match(reply, /京都/);
  assert.match(reply, /寺廟/);
  assert.doesNotMatch(reply, /近期全域聊天摘要/);
  assert.doesNotMatch(reply, /其他記憶片段/);
});
