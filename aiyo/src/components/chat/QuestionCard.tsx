"use client";

import { useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import {
  buildCalendarMatrix,
  formatIsoDateLabel,
  formatQuestionAnswerSummary,
  parseIsoLocalDate,
  shiftMonth,
  toIsoLocalDate,
  type QuestionCardAnswersRecord,
} from "@/components/chat/questionCardUtils";
import { cn } from "@/lib/utils";
import type { ChatQuestion, ChatQuestionAnswer, QuestionCardPayload } from "@/types";

function CalendarDateField({
  label,
  value,
  min,
  disabled,
  onChange,
}: {
  label: string;
  value?: string;
  min?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const initial = parseIsoLocalDate(value) || parseIsoLocalDate(min) || new Date();
    return new Date(initial.getFullYear(), initial.getMonth(), 1);
  });

  const minDate = parseIsoLocalDate(min);
  const monthLabel = visibleMonth.toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
  });
  const selectedIso = value || "";

  return (
    <div className="relative space-y-1">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const nextVisible = parseIsoLocalDate(value) || parseIsoLocalDate(min) || new Date();
          setVisibleMonth(new Date(nextVisible.getFullYear(), nextVisible.getMonth(), 1));
          setOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 transition-colors hover:border-slate-300 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>{formatIsoDateLabel(value)}</span>
        <CalendarDays className="size-4 text-slate-700" aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-[286px] rounded-3xl border border-slate-200 bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.12)]">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setVisibleMonth((prev) => shiftMonth(prev, -1))}
              className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="text-sm font-semibold text-slate-900">{monthLabel}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setVisibleMonth((prev) => shiftMonth(prev, 1))}
              className="rounded-full border border-slate-200 p-1.5 text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-slate-500">
            {["日", "一", "二", "三", "四", "五", "六"].map((weekday) => (
              <span key={weekday}>{weekday}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {buildCalendarMatrix(visibleMonth).map((cell) => {
              const disabledByMin = Boolean(minDate && cell.iso < toIsoLocalDate(minDate));
              const selected = selectedIso === cell.iso;
              return (
                <button
                  key={cell.iso}
                  type="button"
                  disabled={disabled || disabledByMin}
                  onClick={() => {
                    onChange(cell.iso);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex aspect-square items-center justify-center rounded-2xl text-sm transition-colors",
                    selected
                      ? "bg-slate-900 text-white shadow-[0_10px_24px_rgba(15,23,42,0.18)]"
                      : cell.inMonth
                        ? "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        : "bg-transparent text-slate-300 hover:bg-slate-100",
                    disabledByMin ? "cursor-not-allowed opacity-40" : "",
                  )}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function QuestionCard({
  card,
  disabled,
  onSubmit,
  initialAnswers,
  submitted = false,
}: {
  card: QuestionCardPayload;
  disabled?: boolean;
  onSubmit: (answers: ChatQuestionAnswer[], displayMessage: string) => void;
  initialAnswers?: QuestionCardAnswersRecord;
  submitted?: boolean;
}) {
  const [answers, setAnswers] = useState<QuestionCardAnswersRecord>(() => initialAnswers ?? {});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const locked = submitted;
  const fieldsDisabled = disabled || locked;
  const REQUIRED_SLOTS = new Set(["destination", "duration_days"]);

  function isAnswered(question: ChatQuestion, value: unknown): boolean {
    if (question.type === "multi_choice") {
      return Array.isArray(value) && value.length > 0;
    }
    if (question.type === "date_range") {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
      }
      const range = value as { start?: string; end?: string };
      return Boolean((range.start || "").trim() && (range.end || "").trim());
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    return typeof value === "string" ? value.trim().length > 0 : false;
  }

  function setSingle(question: ChatQuestion, value: string) {
    setAnswers((prev) => ({ ...prev, [question.slot]: value }));
  }

  function toggleMulti(question: ChatQuestion, value: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[question.slot]) ? (prev[question.slot] as string[]) : [];
      const next =
        value === "none"
          ? current.includes("none")
            ? []
            : ["none"]
          : current.includes(value)
            ? current.filter((item) => item !== value)
            : [...current.filter((item) => item !== "none"), value];
      return { ...prev, [question.slot]: next };
    });
  }

  function setDateRange(question: ChatQuestion, key: "start" | "end", value: string) {
    setAnswers((prev) => {
      const current =
        typeof prev[question.slot] === "object" && !Array.isArray(prev[question.slot])
          ? (prev[question.slot] as { start?: string; end?: string })
          : {};
      return {
        ...prev,
        [question.slot]: {
          ...current,
          [key]: value,
          ...(key === "start" && current.end && value && current.end < value
            ? { end: value }
            : {}),
        },
      };
    });
  }

  const normalizedAnswers: ChatQuestionAnswer[] = card.questions.map((question) => ({
    slot: question.slot,
    value: answers[question.slot] ?? (question.type === "multi_choice" ? [] : ""),
  }));
  const canSubmit = card.questions.every((question) => {
    const value = answers[question.slot];
    const required = REQUIRED_SLOTS.has(question.slot);
    if (!required) {
      return true;
    }
    return isAnswered(question, value);
  });

  return (
    <div
      className={cn(
        "w-full space-y-4 rounded-3xl border-2 bg-slate-50 p-4",
        locked ? "border-slate-200" : "question-card-attention border-primary/30",
      )}
      aria-label={card.title}
      data-submitted={locked ? "true" : "false"}
    >
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
          {card.eyebrow || "AI 動態提問"}
        </p>
        <h3 className="text-sm font-semibold leading-relaxed text-slate-900">{card.title}</h3>
        {card.description ? (
          <p className="text-xs leading-relaxed text-slate-600">{card.description}</p>
        ) : null}
      </div>
      <div className="space-y-4">
        {card.questions.map((question) => (
          <div key={question.slot} className="space-y-2">
            <p className="text-sm font-medium text-slate-900">{question.question}</p>
            {question.helperText ? (
              <p className="text-xs leading-relaxed text-slate-600">{question.helperText}</p>
            ) : null}
            {question.type === "single_choice" ? (
              <div className="flex flex-wrap gap-2">
                {(question.options || []).map((option) => {
                  const selected = answers[question.slot] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={fieldsDisabled}
                      onClick={() => setSingle(question, option.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : question.type === "budget" ? (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {(question.options || []).map((option) => {
                    const selected = answers[question.slot] === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={fieldsDisabled}
                        onClick={() => setSingle(question, option.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selected
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={fieldsDisabled}
                    onClick={() => setSingle(question, "")}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                      typeof answers[question.slot] === "string" &&
                        !(question.options || []).some((option) => option.value === answers[question.slot])
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                    )}
                  >
                    自訂預算
                  </button>
                </div>
                {typeof answers[question.slot] === "string" &&
                !(question.options || []).some((option) => option.value === answers[question.slot]) ? (
                  <input
                    type="text"
                    disabled={fieldsDisabled}
                    value={typeof answers[question.slot] === "string" ? (answers[question.slot] as string) : ""}
                    onChange={(event) => setSingle(question, event.target.value)}
                    placeholder={question.placeholder || "自訂預算，例如：每人 25000，或總預算 80000"}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
                  />
                ) : null}
              </div>
            ) : question.type === "multi_choice" ? (
              <div className="flex flex-wrap gap-2">
                {(question.options || []).map((option) => {
                  const selected =
                    Array.isArray(answers[question.slot]) &&
                    (answers[question.slot] as string[]).includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={fieldsDisabled}
                      onClick={() => toggleMulti(question, option.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-900 hover:border-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : question.type === "date_range" ? (
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CalendarDateField
                    label={question.startLabel || "開始日期"}
                    disabled={fieldsDisabled}
                    value={
                      typeof answers[question.slot] === "object" && !Array.isArray(answers[question.slot])
                        ? ((answers[question.slot] as { start?: string; end?: string }).start || "")
                        : ""
                    }
                    onChange={(value) => setDateRange(question, "start", value)}
                  />
                  <CalendarDateField
                    label={question.endLabel || "結束日期"}
                    disabled={fieldsDisabled}
                    min={
                      typeof answers[question.slot] === "object" && !Array.isArray(answers[question.slot])
                        ? ((answers[question.slot] as { start?: string; end?: string }).start || undefined)
                        : undefined
                    }
                    value={
                      typeof answers[question.slot] === "object" && !Array.isArray(answers[question.slot])
                        ? ((answers[question.slot] as { start?: string; end?: string }).end || "")
                        : ""
                    }
                    onChange={(value) => setDateRange(question, "end", value)}
                  />
                </div>
              </div>
            ) : (
              <input
                type={question.type === "number" ? "number" : "text"}
                disabled={fieldsDisabled}
                value={typeof answers[question.slot] === "string" ? (answers[question.slot] as string) : ""}
                onChange={(event) => setSingle(question, event.target.value)}
                placeholder={question.placeholder}
                className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-200"
              />
            )}
            {submitAttempted && REQUIRED_SLOTS.has(question.slot) && !isAnswered(question, answers[question.slot]) ? (
              <p className="text-xs text-rose-600">此欄位為必填，請先完成。</p>
            ) : null}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={locked || disabled || !canSubmit}
        onClick={() => {
          if (locked) {
            return;
          }
          setSubmitAttempted(true);
          if (!canSubmit) {
            return;
          }
          onSubmit(normalizedAnswers, formatQuestionAnswerSummary(card, normalizedAnswers));
        }}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors",
          locked
            ? "cursor-not-allowed bg-slate-200 text-slate-500"
            : "bg-slate-900 text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        {disabled && !locked ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {card.action?.label || "繼續"}
      </button>
    </div>
  );
}
