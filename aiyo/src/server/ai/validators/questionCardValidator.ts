import {
  canonicalQuestionOptionValues,
  questionCardSlotValues,
  questionCardTypeValues,
  QuestionCardPayloadSchema,
} from "@/server/ai/schemas/travelPlanningSchemas";
import type { QuestionCardPayload } from "@/types";

const canonicalOptionValueSets: Partial<
  Record<QuestionCardPayload["questions"][number]["slot"], ReadonlySet<string>>
> = Object.fromEntries(
  Object.entries(canonicalQuestionOptionValues).map(([slot, values]) => [slot, new Set(values)]),
) as Partial<Record<QuestionCardPayload["questions"][number]["slot"], ReadonlySet<string>>>;

function trimText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function isQuestionCardSlot(value: string): value is QuestionCardPayload["questions"][number]["slot"] {
  return (questionCardSlotValues as readonly string[]).includes(value);
}

function isQuestionCardType(value: string): value is QuestionCardPayload["questions"][number]["type"] {
  return (questionCardTypeValues as readonly string[]).includes(value);
}

function normalizeDynamicOptions(input: {
  value: unknown;
  slot: QuestionCardPayload["questions"][number]["slot"];
  fallbackQuestion?: QuestionCardPayload["questions"][number];
}): QuestionCardPayload["questions"][number]["options"] {
  const allowlist = canonicalOptionValueSets[input.slot];
  const records = Array.isArray(input.value) ? input.value : [];
  const normalized = records
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const record = item as Record<string, unknown>;
      const label = trimText(record.label, 80);
      const rawValue = trimText(record.value, 80);
      if (!label || !rawValue) {
        return null;
      }
      if (allowlist && !allowlist.has(rawValue)) {
        return null;
      }
      return {
        label,
        value: rawValue,
        recommended: record.recommended === true ? true : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  const seen = new Set<string>();
  const unique = normalized.filter((option) => {
    if (seen.has(option.value)) {
      return false;
    }
    seen.add(option.value);
    return true;
  });

  if (unique.length) {
    return unique.slice(0, 8);
  }
  return input.fallbackQuestion?.options?.slice(0, 8);
}

export function sanitizeDynamicQuestionCard(
  value: unknown,
  fallbackCard: QuestionCardPayload,
): QuestionCardPayload | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const fallbackBySlot = new Map(fallbackCard.questions.map((question) => [question.slot, question]));
  const fallbackSlots = new Set(fallbackBySlot.keys());
  const rawQuestions = Array.isArray(record.questions) ? record.questions : [];
  const questions: QuestionCardPayload["questions"] = rawQuestions
    .map((item): QuestionCardPayload["questions"][number] | null => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const questionRecord = item as Record<string, unknown>;
      const rawSlot = trimText(questionRecord.slot, 40);
      if (!isQuestionCardSlot(rawSlot) || !fallbackSlots.has(rawSlot)) {
        return null;
      }
      const fallbackQuestion = fallbackBySlot.get(rawSlot);
      const rawType = trimText(questionRecord.type, 40);
      const type = isQuestionCardType(rawType) ? rawType : fallbackQuestion?.type;
      const question = trimText(questionRecord.question, 160);
      if (!type || !question) {
        return null;
      }
      const options = normalizeDynamicOptions({
        value: questionRecord.options,
        slot: rawSlot,
        fallbackQuestion,
      });
      if ((type === "single_choice" || type === "multi_choice") && !options?.length) {
        return null;
      }
      return {
        slot: rawSlot,
        question,
        type,
        options: type === "text" || type === "number" || type === "date_range" ? undefined : options,
        placeholder: trimText(questionRecord.placeholder, 100) || fallbackQuestion?.placeholder,
        helperText: trimText(questionRecord.helperText, 140) || undefined,
        startLabel: trimText(questionRecord.startLabel, 40) || fallbackQuestion?.startLabel,
        endLabel: trimText(questionRecord.endLabel, 40) || fallbackQuestion?.endLabel,
      };
    })
    .filter((question): question is QuestionCardPayload["questions"][number] => Boolean(question))
    .slice(0, 4);

  if (!questions.length) {
    return null;
  }

  const candidate: QuestionCardPayload = {
    response_type: "question_card",
    title: trimText(record.title, 120) || fallbackCard.title,
    eyebrow: trimText(record.eyebrow, 40) || undefined,
    description: trimText(record.description, 180) || undefined,
    questions,
    action: {
      label:
        trimText((record.action as Record<string, unknown> | undefined)?.label, 40) ||
        fallbackCard.action?.label ||
        "繼續",
      shortcut:
        trimText((record.action as Record<string, unknown> | undefined)?.shortcut, 20) ||
        fallbackCard.action?.shortcut,
    },
  };

  const parsed = QuestionCardPayloadSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}
