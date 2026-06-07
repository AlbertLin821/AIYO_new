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
