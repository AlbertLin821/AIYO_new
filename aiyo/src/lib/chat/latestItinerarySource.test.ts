import assert from "node:assert/strict";
import test from "node:test";

import type { ChatMessage } from "@/types";
import { findLatestApplicableItinerarySource } from "@/lib/chat/latestItinerarySource";

test("findLatestApplicableItinerarySource parses assistant day-by-day prose into a reusable plan", () => {
  const messages: ChatMessage[] = [
    {
      id: "user-1",
      role: "user",
      content: "幫我規劃熊本五天四夜",
      timestamp: "14:52",
    },
    {
      id: "assistant-1",
      role: "assistant",
      content:
        "收到！為您規劃舒適的大眾運輸行程。\n\n" +
        "Day 1：抵達熊本 & 初探市景\n" +
        "下午：入住飯店後，步行至「八木屋」品嚐拉麵。\n" +
        "Day 2：阿蘇自然之旅\n" +
        "上午：前往「大觀峰展望所」，下午到「草千里之濱」散步。\n" +
        "Day 3：熊本市區深度遊\n" +
        "上午：參觀「熊本城」，中午品嚐「勝烈亭豬排」。\n",
      timestamp: "14:53",
      tripProfile: {
        destination: "熊本",
        duration_days: 3,
      },
    },
  ];

  const result = findLatestApplicableItinerarySource(messages);
  assert.ok(result);
  assert.equal(result?.message.id, "assistant-1");
  assert.equal(result?.plan?.days.length, 3);
  assert.equal(result?.plan?.days[0]?.items[0]?.title, "八木屋");
});

test("findLatestApplicableItinerarySource prefers the latest assistant itinerary-like message", () => {
  const messages: ChatMessage[] = [
    {
      id: "assistant-old",
      role: "assistant",
      content: "Day 1：舊行程\n上午：前往「熊本城」。",
      timestamp: "14:50",
    },
    {
      id: "assistant-new",
      role: "assistant",
      content: "Day 1：新行程\n上午：前往「水前寺成趣園」。",
      timestamp: "14:54",
    },
  ];

  const result = findLatestApplicableItinerarySource(messages);
  assert.ok(result);
  assert.equal(result?.message.id, "assistant-new");
  assert.equal(result?.plan?.days[0]?.items[0]?.title, "水前寺成趣園");
});
