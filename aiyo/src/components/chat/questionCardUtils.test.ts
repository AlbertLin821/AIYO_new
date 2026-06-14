import assert from "node:assert/strict";
import test from "node:test";

import { formatQuestionAnswerSummary } from "@/components/chat/questionCardUtils";
import type { QuestionCardPayload } from "@/types";

const dietaryCard: QuestionCardPayload = {
  response_type: "question_card",
  title: "補充飲食偏好",
  description: "補完後我就繼續安排。",
  questions: [
    {
      slot: "dietary_restrictions",
      question: "有沒有需要先避開的飲食限制或過敏？",
      type: "text",
    },
  ],
  action: { label: "送出並繼續" },
};

test("formatQuestionAnswerSummary turns english no into natural language receipt", () => {
  const summary = formatQuestionAnswerSummary(dietaryCard, [
    {
      slot: "dietary_restrictions",
      value: "no",
    },
  ]);

  assert.equal(summary, "沒有飲食限制，請繼續幫我安排。");
});

test("formatQuestionAnswerSummary treats blank dietary answer as no restriction", () => {
  const summary = formatQuestionAnswerSummary(dietaryCard, [
    {
      slot: "dietary_restrictions",
      value: "",
    },
  ]);

  assert.equal(summary, "沒有飲食限制，請繼續幫我安排。");
});

test("formatQuestionAnswerSummary renders blank dietary answer as none inside multi-question summary", () => {
  const summary = formatQuestionAnswerSummary(
    {
      response_type: "question_card",
      title: "旅行資訊",
      questions: [
        {
          slot: "travel_dates",
          question: "大阪預計哪幾天出發？",
          type: "date_range",
        },
        {
          slot: "dietary_restrictions",
          question: "有沒有需要先避開的飲食限制或過敏？",
          type: "text",
        },
      ],
      action: { label: "送出並繼續" },
    },
    [
      {
        slot: "travel_dates",
        value: {
          start: "2026-06-24",
          end: "2026-06-28",
        },
      },
      {
        slot: "dietary_restrictions",
        value: "",
      },
    ],
  );

  assert.equal(
    summary,
    "我已補充以下資訊：大阪預計哪幾天出發？：2026-06-24 ~ 2026-06-28；有沒有需要先避開的飲食限制或過敏？：無。請依這些條件繼續安排。",
  );
});
