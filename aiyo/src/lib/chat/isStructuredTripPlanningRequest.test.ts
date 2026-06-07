import assert from "node:assert/strict";
import test from "node:test";

import { isStructuredTripPlanningRequest } from "./isStructuredTripPlanningRequest";

test("treats explicit multi-day itinerary requests as structured planning", () => {
  assert.equal(isStructuredTripPlanningRequest("幫我安排熊本7天6夜行程"), true);
  assert.equal(isStructuredTripPlanningRequest("請幫我規劃東京 5 天自由行"), true);
  assert.equal(isStructuredTripPlanningRequest("熊本 Day 3 改成逛街路線"), true);
});

test("does not treat casual travel questions as structured planning", () => {
  assert.equal(isStructuredTripPlanningRequest("東京適合第一次自由行嗎？"), false);
  assert.equal(isStructuredTripPlanningRequest("熊本有什麼好吃的"), false);
  assert.equal(isStructuredTripPlanningRequest(""), false);
});
