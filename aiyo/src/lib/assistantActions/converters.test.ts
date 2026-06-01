import assert from "node:assert/strict";
import test from "node:test";
import {
  assistantActionToLegacyProposedChange,
  legacyProposedChangeToAssistantAction,
} from "@/lib/assistantActions/converters";

test("assistantActionToLegacyProposedChange converts add item", () => {
  const change = assistantActionToLegacyProposedChange({
    type: "itinerary.add_item",
    payload: {
      dayId: "day-1",
      item: { title: "東京晴空塔", location: "Tokyo Skytree", startTime: "17:00" },
    },
  });
  assert.equal(change?.type, "add_itinerary_item");
  assert.equal(change?.day, 1);
  assert.equal(change?.title, "東京晴空塔");
});

test("assistantActionToLegacyProposedChange converts update item", () => {
  const change = assistantActionToLegacyProposedChange({
    type: "itinerary.update_item",
    payload: {
      dayId: "day-2",
      itemId: "item-a",
      patch: { title: "東京晴空塔", location: "Tokyo Skytree" },
    },
  });
  assert.equal(change?.type, "update_itinerary_item");
  assert.equal(change?.day, 2);
  assert.equal(change?.itemId, "item-a");
  assert.equal(change?.locationName, "Tokyo Skytree");
});

test("assistantActionToLegacyProposedChange converts remove item", () => {
  const change = assistantActionToLegacyProposedChange({
    type: "itinerary.remove_item",
    payload: { dayId: "day-2", itemId: "item-a" },
  });
  assert.equal(change?.type, "remove_itinerary_item");
  assert.equal(change?.day, 2);
  assert.equal(change?.itemId, "item-a");
});

test("legacyProposedChangeToAssistantAction converts legacy update", () => {
  const action = legacyProposedChangeToAssistantAction({
    type: "update_itinerary_item",
    day: 2,
    itemId: "item-a",
    title: "東京晴空塔",
    locationName: "Tokyo Skytree",
    source: "ai-chat",
  });
  assert.equal(action?.type, "itinerary.update_item");
  assert.equal(action?.payload.dayId, "day-2");
});
