import assert from "node:assert/strict";
import test from "node:test";

import { guardDestructiveChatMessage } from "@/server/ai/destructiveConfirmation";
import type { ChatContext } from "@/types";

const context: ChatContext = {
  destination: "東京",
  itinerary: [
    { dayNumber: 1, items: [{ id: "day1-ueno", title: "上野公園", time: "09:00", type: "attraction" }] },
    {
      dayNumber: 2,
      items: [
        { id: "day2-meiji", title: "明治神宮", time: "10:00", type: "attraction" },
        { id: "day2-shibuya", title: "澀谷十字路口", time: "15:00", type: "attraction" },
      ],
    },
  ],
};

test("destructive day clear asks confirmation and emits no mutation first", () => {
  const guarded = guardDestructiveChatMessage({
    userId: "user-a",
    tripId: "trip-a",
    message: "第二天全部清空。",
    context,
  });

  assert.equal(guarded.kind, "respond");
  if (guarded.kind === "respond") {
    assert.match(guarded.response.reply.content, /刪除|清空|確認/u);
    assert.deepEqual(guarded.response.assistantActions, []);
  }
});

test("explicit confirmation clears only the pending target day", () => {
  guardDestructiveChatMessage({
    userId: "user-confirm",
    tripId: "trip-confirm",
    message: "第二天全部清空。",
    context,
  });

  const confirmed = guardDestructiveChatMessage({
    userId: "user-confirm",
    tripId: "trip-confirm",
    message: "確認清空第 2 天",
    context,
  });

  assert.equal(confirmed.kind, "respond");
  if (confirmed.kind === "respond") {
    assert.deepEqual(
      confirmed.response.assistantActions?.map((action) => action.type),
      ["itinerary.remove_item", "itinerary.remove_item"],
    );
    assert.deepEqual(
      confirmed.response.assistantActions?.map((action) =>
        action.type === "itinerary.remove_item" ? action.payload.itemId : "",
      ),
      ["day2-meiji", "day2-shibuya"],
    );
  }
});

test("cancel clears pending destructive confirmation without actions", () => {
  guardDestructiveChatMessage({
    userId: "user-cancel",
    tripId: "trip-cancel",
    message: "第二天全部清空。",
    context,
  });

  const cancelled = guardDestructiveChatMessage({
    userId: "user-cancel",
    tripId: "trip-cancel",
    message: "算了",
    context,
  });

  assert.equal(cancelled.kind, "respond");
  if (cancelled.kind === "respond") {
    assert.deepEqual(cancelled.response.assistantActions, []);
  }
});

test("another user cannot confirm a pending destructive operation", () => {
  guardDestructiveChatMessage({
    userId: "user-owner",
    tripId: "trip-owner",
    message: "第二天全部清空。",
    context,
  });

  const otherUser = guardDestructiveChatMessage({
    userId: "user-other",
    tripId: "trip-owner",
    message: "確認清空第 2 天",
    context,
  });

  assert.equal(otherUser.kind, "respond");
  if (otherUser.kind === "respond") {
    assert.deepEqual(otherUser.response.assistantActions, []);
    assert.match(otherUser.response.reply.content, /請明確回覆|破壞性操作/u);
  }
});

test("explicit confirmation can remove all current itinerary items for whole-trip destructive intent", () => {
  guardDestructiveChatMessage({
    userId: "user-whole",
    tripId: "trip-whole",
    message: "刪除整份東京行程",
    context,
  });

  const confirmed = guardDestructiveChatMessage({
    userId: "user-whole",
    tripId: "trip-whole",
    message: "確認刪除東京行程",
    context,
  });

  assert.equal(confirmed.kind, "respond");
  if (confirmed.kind === "respond") {
    assert.deepEqual(
      confirmed.response.assistantActions?.map((action) =>
        action.type === "itinerary.remove_item" ? action.payload.itemId : "",
      ),
      ["day1-ueno", "day2-meiji", "day2-shibuya"],
    );
  }
});
