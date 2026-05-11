import assert from "node:assert/strict";
import test from "node:test";
import { buildChatPrompt, buildItineraryPrompt, buildVideoMomentPolishingPrompt } from "@/server/ai/promptBuilder";
import type { TripPlanRequest } from "@/types";

const request: TripPlanRequest = {
  destination: "台南",
  days: 2,
  budget: 8000,
  preferences: {
    interests: ["food", "history"],
    pace: "moderate",
    transportPreference: "Train",
    mustVisit: ["神農街"],
    avoid: ["酒吧"],
    notes: "想走古蹟與小吃路線",
  },
};

test("buildItineraryPrompt includes layered constraints and memory context", () => {
  const prompt = buildItineraryPrompt(request, "1. user likes ramen");
  assert.match(prompt, /HARD SCHEMA RULES:/);
  assert.match(prompt, /QUALITY RULES:/);
  assert.match(prompt, /DESTINATION CONSTRAINTS:/);
  assert.match(prompt, /Must visit: 神農街/);
  assert.match(prompt, /Avoid: 酒吧/);
  assert.match(prompt, /Relevant long-term memory: 1\. user likes ramen/);
});

test("buildItineraryPrompt strict-format mode adds strict retry instructions", () => {
  const prompt = buildItineraryPrompt(request, undefined, { retryMode: "strict-format" });
  assert.match(prompt, /STRICT FORMAT RETRY MODE:/);
  assert.match(prompt, /Every day must include an `items` array\./);
  assert.match(prompt, /Output raw JSON only/);
});

test("buildItineraryPrompt includes web search grounding when provided", () => {
  const prompt = buildItineraryPrompt(request, undefined, {
    webSearchDigest:
      "1. Title: 嘉義文化路夜市\n   URL: https://example.com/night-market\n   Snippet: 最新店家與營業資訊",
  });
  assert.match(prompt, /WEB SEARCH FACTUAL GROUNDING:/);
  assert.match(prompt, /\[Web Search Results\]/);
  assert.match(prompt, /sourceTitle\/sourceUrl\/sourceSnippet/);
});

test("buildChatPrompt includes web search grounding block", () => {
  const prompt = buildChatPrompt(
    "嘉義有什麼最新景點推薦？",
    undefined,
    undefined,
    "weather digest",
    "1. Title: 嘉義公園\n   URL: https://example.com/park\n   Snippet: 近期活動資訊",
  );
  assert.match(prompt.user, /\[Web Search Results\]/);
  assert.match(prompt.system, /factual grounding/);
});

test("buildVideoMomentPolishingPrompt enforces preserve rules", () => {
  const prompt = buildVideoMomentPolishingPrompt({
    title: "嘉義美食影片",
    destination: "嘉義",
    language: "traditional-chinese",
    moments: [
      {
        id: "moment_1",
        timestamp: "03:20",
        startSeconds: 200,
        endSeconds: 260,
        title: "文化路夜市小吃散步",
        text: "這段介紹文化路夜市周邊小吃。",
        locationHints: ["文化路夜市"],
        foods: ["火雞肉飯", "砂鍋魚頭"],
      },
    ],
  });
  assert.match(prompt, /Preserve id, timestamp, startSeconds, endSeconds exactly/);
  assert.match(prompt, /do not add new POIs/);
  assert.match(prompt, /Title 長度盡量 22 字內/);
  assert.match(prompt, /standalone vague words/);
});
