import assert from "node:assert/strict";
import test from "node:test";

import {
  isApplyPreviousItineraryCommand,
  isFullItineraryRevisionCommand,
  isPersonalMemoryRecallIntent,
  shouldShowPlanningWorkflowRail,
} from "@/lib/chat/workflowRailVisibility";

test("shouldShowPlanningWorkflowRail hides rail for personal memory recall questions", () => {
  assert.equal(
    shouldShowPlanningWorkflowRail({ message: "我之前去過哪些地方" }),
    false,
  );
  assert.equal(isPersonalMemoryRecallIntent("我之前去過哪些地方"), true);
});

test("shouldShowPlanningWorkflowRail shows rail for new trip planning requests", () => {
  assert.equal(shouldShowPlanningWorkflowRail({ message: "幫我規劃東京 5 天" }), true);
});

test("shouldShowPlanningWorkflowRail hides rail for partial itinerary adjustments", () => {
  assert.equal(shouldShowPlanningWorkflowRail({ message: "把第三天改成迪士尼" }), false);
});

test("shouldShowPlanningWorkflowRail shows rail for full itinerary revision", () => {
  assert.equal(shouldShowPlanningWorkflowRail({ message: "幫我重新規劃整份行程" }), true);
});

test("simple planning request is not treated as full itinerary revision", () => {
  assert.equal(isFullItineraryRevisionCommand("幫我規劃一下行程"), false);
  assert.equal(isFullItineraryRevisionCommand("幫我完整規劃整份行程"), true);
});

test("apply previous itinerary command accepts text-description wording", () => {
  assert.equal(isApplyPreviousItineraryCommand("把他文字敘述的內容改到我的行程裡"), true);
  assert.equal(isApplyPreviousItineraryCommand("把這些內容加到我的行程裡面"), true);
  assert.equal(isApplyPreviousItineraryCommand("把這些行程丟到我的即時行程裡面"), true);
  assert.equal(isApplyPreviousItineraryCommand("那直接替換到現有的行程"), true);
});

test("shouldShowPlanningWorkflowRail hides rail for answer_trip_question mode", () => {
  assert.equal(
    shouldShowPlanningWorkflowRail({
      travelAgentMode: "answer_trip_question",
      responseType: "text_message",
    }),
    false,
  );
});

test("shouldShowPlanningWorkflowRail shows rail for question_card and confirm_preferences", () => {
  assert.equal(
    shouldShowPlanningWorkflowRail({
      responseType: "question_card",
    }),
    true,
  );
  assert.equal(
    shouldShowPlanningWorkflowRail({
      travelAgentMode: "confirm_preferences",
      hasPreferenceConfirmation: true,
    }),
    true,
  );
});

test("shouldShowPlanningWorkflowRail hides rail for modify_itinerary mode", () => {
  assert.equal(
    shouldShowPlanningWorkflowRail({
      travelAgentMode: "modify_itinerary",
      responseType: "text_message",
    }),
    false,
  );
});

test("shouldShowPlanningWorkflowRail continues question card flow when inQuestionCardFlow", () => {
  assert.equal(
    shouldShowPlanningWorkflowRail({
      message: "隨便一句話",
      inQuestionCardFlow: true,
    }),
    true,
  );
});
