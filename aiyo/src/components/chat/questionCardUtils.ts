import type { ChatQuestionAnswer, QuestionCardPayload } from "@/types";

export type QuestionCardAnswersRecord = Record<
  string,
  string | string[] | { start?: string; end?: string }
>;

export function answersRecordFromPayload(
  answers: ChatQuestionAnswer[],
): QuestionCardAnswersRecord {
  const record: QuestionCardAnswersRecord = {};
  for (const answer of answers) {
    if (answer.value === null || answer.value === undefined) {
      continue;
    }
    record[answer.slot] =
      typeof answer.value === "number" ? String(answer.value) : answer.value;
  }
  return record;
}

export function formatQuestionAnswerSummary(
  card: QuestionCardPayload,
  answers: ChatQuestionAnswer[],
): string {
  const lines = answers.map((answer) => {
    const question = card.questions.find((item) => item.slot === answer.slot);
    if (answer.value && typeof answer.value === "object" && !Array.isArray(answer.value)) {
      const range = answer.value as { start?: string; end?: string };
      return `${question?.question || answer.slot}：${range.start || "未指定"} ~ ${range.end || "未指定"}`;
    }
    const values = Array.isArray(answer.value)
      ? answer.value
      : answer.value === null || answer.value === undefined
        ? []
        : [String(answer.value)];
    const labels = values.map(
      (value) => question?.options?.find((option) => option.value === value)?.label || value,
    );
    return `${question?.question || answer.slot}：${labels.join("、") || "未填寫"}`;
  });
  if (answers.length === 1) {
    const answer = answers[0];
    if (answer?.slot === "dietary_restrictions") {
      const rawValue = Array.isArray(answer.value)
        ? answer.value.join("、")
        : String(answer.value || "").trim();
      if (/^(?:無|沒有|都可以|不限|無特殊|沒有飲食限制|無特殊飲食限制|no|none|no restrictions?|no allergies?)$/iu.test(rawValue)) {
        return "沒有飲食限制，請繼續幫我安排。";
      }
      if (rawValue) {
        return `飲食偏好是${rawValue}，請依這個條件繼續安排。`;
      }
    }
  }
  if (lines.length === 1) {
    return `${lines[0]}，請繼續幫我安排。`;
  }
  return `我已補充以下資訊：${lines.join("；")}。請依這些條件繼續安排。`;
}

export function formatIsoDateLabel(value: string | undefined): string {
  if (!value) {
    return "未選擇";
  }
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
  });
}

export function parseIsoLocalDate(value?: string): Date | null {
  if (!value) {
    return null;
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const parsed = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== Number(match[1]) ||
    parsed.getMonth() !== Number(match[2]) - 1 ||
    parsed.getDate() !== Number(match[3])
  ) {
    return null;
  }
  return parsed;
}

export function toIsoLocalDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

export function shiftMonth(value: Date, delta: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

export function buildCalendarMatrix(month: Date): Array<{ iso: string; day: number; inMonth: boolean }> {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const firstWeekday = firstDay.getDay();
  const start = new Date(year, monthIndex, 1 - firstWeekday);
  return Array.from({ length: 42 }, (_, index) => {
    const current = new Date(start);
    current.setDate(start.getDate() + index);
    return {
      iso: toIsoLocalDate(current),
      day: current.getDate(),
      inMonth: current.getMonth() === monthIndex,
    };
  });
}
