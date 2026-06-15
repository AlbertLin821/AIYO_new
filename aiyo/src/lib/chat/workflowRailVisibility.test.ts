import assert from "node:assert/strict";
import test from "node:test";

import {
  isDestructiveItineraryCommand,
  isApplyPreviousItineraryCommand,
  isConversationOnlyMessage,
  isFullItineraryRevisionCommand,
  isPersonalMemoryRecallIntent,
  shouldAttachDecisionPreferenceConfirmation,
  shouldRenderInlinePreferenceReusePanel,
  shouldShowPlanningWorkflowRail,
} from "@/lib/chat/workflowRailVisibility";

test("shouldShowPlanningWorkflowRail hides rail for personal memory recall questions", () => {
  assert.equal(
    shouldShowPlanningWorkflowRail({ message: "我之前去過哪些地方" }),
    false,
  );
  assert.equal(isPersonalMemoryRecallIntent("我之前去過哪些地方"), true);
});

test("conversation-only self-introduction hides planning rail even during a question-card flow", () => {
  assert.equal(isConversationOnlyMessage("我是user4"), true);
  assert.equal(
    shouldShowPlanningWorkflowRail({
      message: "我是user4",
      inQuestionCardFlow: true,
    }),
    false,
  );
});

test("identity recall questions are memory recall, not planning workflow", () => {
  assert.equal(isPersonalMemoryRecallIntent("我是誰"), true);
  assert.equal(shouldShowPlanningWorkflowRail({ message: "我是誰" }), false);
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

test("destructive day clear is detected separately from full trip revision", () => {
  assert.equal(isDestructiveItineraryCommand("第二天全部清空。"), true);
  assert.equal(isFullItineraryRevisionCommand("第二天全部清空。"), false);
  assert.equal(shouldShowPlanningWorkflowRail({ message: "第二天全部清空。" }), false);
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

test("shouldAttachDecisionPreferenceConfirmation only surfaces confirm_preferences responses", () => {
  assert.equal(
    shouldAttachDecisionPreferenceConfirmation({
      travelAgentMode: "confirm_preferences",
      responseType: "text_message",
      replyPreferenceConfirmation: null,
      decisionPreferenceConfirmation: {
        summary: "中等預算",
        preferences: {},
        prompt: "要沿用這些偏好嗎？",
      },
    }),
    true,
  );

  assert.equal(
    shouldAttachDecisionPreferenceConfirmation({
      travelAgentMode: "generate_itinerary",
      responseType: "travel_plan",
      replyPreferenceConfirmation: null,
      decisionPreferenceConfirmation: {
        summary: "中等預算",
        preferences: {},
        prompt: "需求已足夠，可以進入行程生成。",
      },
    }),
    false,
  );
});

test("shouldRenderInlinePreferenceReusePanel hides stale confirmation on travel plan replies", () => {
  assert.equal(
    shouldRenderInlinePreferenceReusePanel({
      role: "assistant",
      isLastMessage: true,
      responseType: "travel_plan",
      hasQuestionCard: false,
      messagePreferenceConfirmation: {
        summary: "中等預算",
        preferences: {},
        prompt: "需求已足夠，可以進入行程生成。",
      },
    }),
    false,
  );

  assert.equal(
    shouldRenderInlinePreferenceReusePanel({
      role: "assistant",
      isLastMessage: true,
      responseType: "text_message",
      hasQuestionCard: false,
      workflowRailMode: "confirm_preferences",
      workflowRailPreferenceConfirmation: {
        summary: "中等預算",
        preferences: {},
        prompt: "要沿用這些偏好嗎？",
      },
    }),
    true,
  );
});
