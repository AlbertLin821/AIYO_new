import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPlanningUpdateFromText } from "@/lib/planningContext";

test("extractPlanningUpdateFromText parses trip duration phrases", () => {
  assert.deepEqual(extractPlanningUpdateFromText("我想去東京玩三天"), { destination: "東京", days: 3 });
  assert.deepEqual(extractPlanningUpdateFromText("排 5 天京都"), { destination: "京都", days: 5 });
});

test("extractPlanningUpdateFromText ignores ordinal day references in itinerary edits", () => {
  assert.deepEqual(extractPlanningUpdateFromText("幫我把第二天的秋葉原改成晴空塔"), {});
  assert.deepEqual(extractPlanningUpdateFromText("幫我把晴空塔加到第一天下午"), {});
  assert.deepEqual(extractPlanningUpdateFromText("把第二天順序改成銀座、晴空塔"), {});
});
