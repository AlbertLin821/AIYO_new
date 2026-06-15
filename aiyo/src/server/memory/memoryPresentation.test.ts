import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  buildStableMemoryMessages,
  listDisplayMemoriesForUser,
} from "@/server/memory/memoryPresentation";
import type { ChatResponsePayload, TripProfile, TripPlanResult } from "@/types";

function makeTripProfile(): TripProfile {
  return {
    destination: "熊本",
    duration_days: 7,
    duration_nights: 6,
    departure_location: null,
    travel_dates: { start: "2026-06-24", end: "2026-06-30" },
    companions: "small_group",
    traveler_count: 4,
    budget: "comfortable",
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: ["美食", "自然風景"],
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

function makeResponse(plan?: TripPlanResult): ChatResponsePayload {
  return {
    reply: {
      id: "assistant_1",
      role: "assistant",
      content: "已整理好。",
      timestamp: "10:00",
      responseType: "text_message",
    },
    itinerarySuggestion: plan,
  };
}

test("buildStableMemoryMessages keeps stable trip facts and planned places only", () => {
  const messages = buildStableMemoryMessages({
    userMessage: "幫我規劃熊本行程",
    tripProfile: makeTripProfile(),
    response: makeResponse({
      summary: "熊本七天六夜",
      days: [
        {
          dayNumber: 1,
          items: [
            { id: "1", time: "09:00", title: "熊本城", type: "attraction" },
            { id: "2", time: "12:00", title: "午餐", type: "restaurant" },
            { id: "3", time: "15:00", title: "草千里之濱", type: "attraction" },
          ],
        },
      ],
    }),
  });

  assert.deepEqual(messages, [
    { role: "assistant", content: "熊本 這趟行程已確認：7 天，2026-06-24 至 2026-06-30，4 人" },
    { role: "assistant", content: "熊本 這趟行程的偏好：交通偏好：public_transport；旅遊節奏：relaxed；興趣：美食、自然風景" },
    { role: "assistant", content: "熊本 行程目前規劃的代表地點：熊本城、草千里之濱" },
  ]);
});

test("buildStableMemoryMessages skips empty or unstable memory writes", () => {
  const messages = buildStableMemoryMessages({
    userMessage: "你好",
    response: makeResponse(),
  });

  assert.deepEqual(messages, []);
});

test("buildStableMemoryMessages stores self-identification as a stable memory", () => {
  const messages = buildStableMemoryMessages({
    userMessage: "我是user4",
    response: makeResponse(),
  });

  assert.deepEqual(messages, [{ role: "assistant", content: "使用者稱呼：user4" }]);
});

test("listDisplayMemoriesForUser shows trip summaries without mem0 records", async () => {
  const originalTripFindMany = prisma.trip.findMany;
  Object.assign(prisma.trip, {
    findMany: async () => [
      {
        id: "trip_1",
        title: "熊本兩天",
        destination: "熊本",
        days: 2,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-02T00:00:00.000Z"),
        items: [{ title: "熊本城" }, { title: "午餐" }, { title: "水前寺成趣園" }],
      },
    ],
  });

  try {
    const memories = await listDisplayMemoriesForUser("user_1");

    assert.equal(memories[0]?.kind, "trip_summary");
    assert.match(memories[0]?.memory || "", /熊本/);
    assert.match(memories[0]?.memory || "", /熊本城/);
    assert.match(memories[0]?.memory || "", /水前寺成趣園/);
    assert.doesNotMatch(memories[0]?.memory || "", /午餐/);
  } finally {
    Object.assign(prisma.trip, { findMany: originalTripFindMany });
  }
});
