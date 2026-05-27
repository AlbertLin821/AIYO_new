import assert from "node:assert/strict";
import test from "node:test";
import { applyChatMessageMetadata, extractChatMessageMetadata } from "./chatMessageMetadata";
import type { ChatMessage } from "@/types";

test("extractChatMessageMetadata returns null for plain text", () => {
  const message: ChatMessage = {
    id: "1",
    role: "user",
    content: "hello",
    timestamp: "12:00",
  };
  assert.equal(extractChatMessageMetadata(message), null);
});

test("extractChatMessageMetadata round-trips travel plan fields", () => {
  const message: ChatMessage = {
    id: "2",
    role: "assistant",
    content: "plan ready",
    timestamp: "12:01",
    responseType: "travel_plan",
    travelPlan: {
      response_type: "travel_plan",
      title: "Tokyo",
      summary: "3 days",
      summary_table: [],
      days: [],
      citations: [],
      weather_alerts: [],
      event_alerts: [],
      assumptions: [],
    },
  };
  const stored = extractChatMessageMetadata(message);
  assert.ok(stored?.travelPlan);
  const restored = applyChatMessageMetadata(
    { id: "2", role: "assistant", content: "plan ready", timestamp: "12:01" },
    stored,
  );
  assert.equal(restored.responseType, "travel_plan");
  assert.equal(restored.travelPlan?.title, "Tokyo");
});
