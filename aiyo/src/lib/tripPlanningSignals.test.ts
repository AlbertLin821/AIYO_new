import assert from "node:assert/strict";
import test from "node:test";
import { inferPlanningUpdateFromTexts } from "@/lib/tripPlanningSignals";

test("inferPlanningUpdateFromTexts reads Kumamoto from assistant reply", () => {
  const update = inferPlanningUpdateFromTexts([
    "好的！熊本是九州非常有魅力的城市，這裡有幾個推薦方向給你：",
    "熊本城、阿蘇山",
  ]);
  assert.equal(update.destination, "熊本");
});

test("inferPlanningUpdateFromTexts reads five days from user message", () => {
  const update = inferPlanningUpdateFromTexts(["五天好了 我想改"]);
  assert.equal(update.days, 5);
});
