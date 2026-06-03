import assert from "node:assert/strict";
import test from "node:test";
import { validateAssistantActions } from "@/server/ai/assistantActionValidator";
import type { PersonalizedAIContext } from "@/types";

function context(userId = "user-1"): PersonalizedAIContext {
  return {
    userId,
    currentTrip: {
      id: "trip-1",
      title: "東京行",
      destination: "東京",
      days: [
        {
          id: "day-1",
          dayNumber: 1,
          items: [{ id: "a", title: "淺草" }, { id: "b", title: "上野" }],
        },
        {
          id: "day-2",
          dayNumber: 2,
          items: [{ id: "c", title: "秋葉原" }],
        },
      ],
    },
    preferences: {},
    recentTrips: [],
    tripChatHistory: [],
    globalChatMemory: [],
    videoInteractions: [],
    appliedVideoSummaries: [],
    memorySnippets: [],
    contextWarnings: [],
  };
}

test("valid trip day item update passes", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    tripId: "trip-1",
    structuredContext: context(),
    actions: [{ type: "itinerary.update_item", payload: { dayId: "day-2", itemId: "c", patch: { title: "晴空塔" } } }],
  });
  assert.equal(result.validActions.length, 1);
});

test("trip from another user is rejected", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context("user-2"),
    actions: [{ type: "trip.update_metadata", payload: { tripId: "trip-1", title: "x" } }],
  });
  assert.equal(result.validActions.length, 0);
  assert.equal(result.rejectedActions.length, 1);
});

test("missing dayId is rejected", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context(),
    actions: [{ type: "itinerary.add_item", payload: { dayId: "day-9", item: { title: "晴空塔" } } }],
  });
  assert.equal(result.rejectedActions[0]?.reason, "dayId does not exist in current trip");
  assert.ok(result.warnings.includes("dayId does not exist in current trip"));
});

test("missing itemId is rejected", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context(),
    actions: [{ type: "itinerary.remove_item", payload: { dayId: "day-2", itemId: "missing" } }],
  });
  assert.equal(result.rejectedActions[0]?.reason, "itemId does not exist in target day");
});

test("reorder missing item is rejected", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context(),
    actions: [{ type: "itinerary.reorder_items", payload: { dayId: "day-1", orderedItemIds: ["a"] } }],
  });
  assert.equal(result.rejectedActions[0]?.reason, "orderedItemIds must match day item ids exactly");
});

test("replace_day over limit is rejected", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context(),
    actions: [{ type: "itinerary.replace_day", payload: { dayId: "day-1", items: Array.from({ length: 13 }, (_, i) => ({ title: `景點${i}` })) } }],
  });
  assert.equal(result.rejectedActions[0]?.reason, "replace_day has too many items");
});

test("unknown action type is rejected", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context(),
    actions: [{ type: "raw.sql", payload: { sql: "drop table trips" } }],
  });
  assert.equal(result.rejectedActions[0]?.reason, "unknown action type");
  assert.ok(result.warnings.includes("unknown action type"));
});

test("dangerous text is rejected with warning", () => {
  const result = validateAssistantActions({
    userId: "user-1",
    structuredContext: context(),
    actions: [
      {
        type: "itinerary.update_item",
        payload: {
          dayId: "day-1",
          itemId: "a",
          patch: { notes: "<script>alert(1)</script>" },
        },
      },
    ],
  });
  assert.equal(result.validActions.length, 0);
  assert.equal(result.rejectedActions[0]?.reason, "dangerous text rejected");
  assert.ok(result.warnings.includes("dangerous text rejected"));
});
