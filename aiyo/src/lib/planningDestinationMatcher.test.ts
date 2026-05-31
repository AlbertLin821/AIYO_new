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
