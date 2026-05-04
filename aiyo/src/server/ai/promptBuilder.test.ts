import assert from "node:assert/strict";
import test from "node:test";
import { buildItineraryPrompt } from "@/server/ai/promptBuilder";
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
