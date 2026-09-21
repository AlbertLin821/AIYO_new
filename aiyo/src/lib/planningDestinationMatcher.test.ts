import assert from "node:assert/strict";
import test from "node:test";
import { matchDestinationInPlanningText } from "@/lib/planningDestinationMatcher";

test("matchDestinationInPlanningText resolves preloaded pack aliases", () => {
  assert.equal(matchDestinationInPlanningText("想去峇里島度假"), "峇里島");
  assert.equal(matchDestinationInPlanningText("plan a trip to Paris"), "巴黎");
});

test("matchDestinationInPlanningText resolves supplement cities", () => {
  assert.equal(matchDestinationInPlanningText("熊本城怎麼排"), "熊本");
});

test("excluded destinations never replace the requested city", () => {
  assert.equal(matchDestinationInPlanningText("幫我安排嘉義市 2 天 1 夜，也不要安排阿里山深度行程。"), "嘉義");
  assert.equal(matchDestinationInPlanningText("不要去阿里山，改去嘉義兩天"), "嘉義");
  assert.equal(matchDestinationInPlanningText("東京三天，京都不要去。"), "東京");
  assert.equal(matchDestinationInPlanningText("不要安排阿里山"), undefined);
  assert.equal(matchDestinationInPlanningText("九州旅遊，不去熊本"), "九州");
  assert.equal(matchDestinationInPlanningText("Visit Paris, avoid London"), "巴黎");
  assert.equal(matchDestinationInPlanningText("不要太趕的東京行程"), "東京");
  assert.equal(matchDestinationInPlanningText("comparison of budgets"), undefined);
  assert.equal(matchDestinationInPlanningText("不是台北，是嘉義"), "嘉義");
  assert.equal(matchDestinationInPlanningText("不去京都、奈良，改去大阪"), "大阪");
});
