"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import PastelRainbowBackground from "@/components/effects/PastelRainbowBackground";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Heart,
  History,
  Loader2,
  MapPin,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import { CitationGroup } from "@/components/chat/SourceTag";
import VideoCard from "@/components/home/VideoCard";
import { zhTW as t } from "@/locales/zh-TW";
import {
  applyPlanningUpdateToStores,
  derivePlanningSnapshot,
  extractIsoDateRangeFromText,
  extractPlanningUpdateFromText,
} from "@/lib/planningContext";
import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  logFrontendDebugEvent,
  startFrontendDebugProcess,
  updateFrontendDebugProcess,
} from "@/lib/frontendDebug";
import { cn } from "@/lib/utils";
import { reviseTripPlan, sendChatMessage } from "@/services/aiClient";
import { createNewTrip, listTripsForLibrary, setActiveTrip } from "@/services/itineraryClient";
import { syncService } from "@/services/syncService";
import { fetchVideoRecommendations, shouldSkipClientVideoSummarize, summarizeVideo } from "@/services/videoClient";
import { useChatStore } from "@/stores/useChatStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUserStore } from "@/stores/useUserStore";
import { useVideoStore } from "@/stores/useVideoStore";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type {
  AiProposedChange,
  ChatMessage,
  ChatQuestion,
  ChatQuestionAnswer,
  QuestionCardPayload,
  StatusStepPayload,
  TravelPlanResponse,
  TripPlanItem,
  TripProfile,
  VideoRecommendation,
  VideoSummaryResult,
} from "@/types";

const VideoSummaryDrawer = dynamic(
  () => import("@/components/home/VideoSummaryDrawer"),
  { ssr: false },
);

function buildVideoSummaryKey(input: {
  videoId?: string;
  destination?: string;
  refresh?: boolean;
}) {
  return [
    input.refresh ? "refresh" : "summary",
    input.videoId?.trim() || "unknown-video",
    input.destination?.trim() || "any-destination",
  ].join(":");
}

function videoMatches(candidate: VideoRecommendation | null, source: VideoRecommendation) {
  if (!candidate) {
    return false;
  }
  if (candidate.id === source.id) {
    return true;
  }
  return Boolean(candidate.videoId && source.videoId && candidate.videoId === source.videoId);
}

function buildUserMessage(content: string): ChatMessage {
  return {
    id: `chat_user_${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function buildAssistantLocalMessage(content: string): ChatMessage {
  return {
    id: `chat_assistant_local_${Date.now()}`,
    role: "assistant",
    content,
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    responseType: "text_message",
  };
}

function formatTripUpdatedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("zh-TW", {
    month: "short",
    day: "numeric",
  });
}

function shouldRecommendVideos(message: string): boolean {
  return /影片|youtube|YouTube|video|vlog|推薦.*看|找.*看|旅遊.*看|景點.*影片/i.test(message);
}

function isItineraryMutationCommand(message: string): boolean {
  return /新增|加入|加上|刪除|移除|修改|調整|改成|換成|改到|提前|延後|移到|重排|重新規劃|幫我(?:安排|規劃|新增|加入|調整|修改|刪除|移除)|請(?:安排|規劃|新增|加入|調整|修改|刪除|移除)/u.test(message);
}

type AddItineraryChange = Extract<AiProposedChange, { type: "add_itinerary_item" }>;
type ExistingItemChange = Extract<
  AiProposedChange,
  { type: "update_itinerary_item" | "remove_itinerary_item" }
>;

function buildItineraryItemFromAiChange(change: AddItineraryChange): TripPlanItem {
  const title = change.title.trim() || change.locationName?.trim() || "AI 建議行程";
  return {
    id: `ai_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dayNumber: change.day,
    time: change.time,
    title,
    type: /夜市|飯|餐|小吃|美食|魚頭/.test(title) ? "restaurant" : "attraction",
    notes: [change.locationName ? `地點：${change.locationName}` : "", change.notes || ""].filter(Boolean).join("\n") || undefined,
    source: "ai",
    location: undefined,
  };
}

function compactItineraryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function findItineraryItemTarget(change: ExistingItemChange) {
  const itinerary = useTripStore.getState().itinerary;
  const scopedDays = change.day
    ? itinerary.filter((day) => day.dayNumber === change.day)
    : itinerary;
  if (change.itemId) {
    for (const day of scopedDays) {
      const item = day.items.find((candidate) => candidate.id === change.itemId);
      if (item) {
        return { dayNumber: day.dayNumber, item };
      }
    }
  }

  const targetTitle = compactItineraryText(change.targetTitle || "");
  if (!targetTitle) {
    return null;
  }
  for (const day of scopedDays) {
    const item = day.items.find((candidate) => {
      const title = compactItineraryText(candidate.title);
      const location = compactItineraryText(candidate.location?.name || "");
      return title.includes(targetTitle) || targetTitle.includes(title) || Boolean(location && (location.includes(targetTitle) || targetTitle.includes(location)));
    });
    if (item) {
      return { dayNumber: day.dayNumber, item };
    }
  }
  return null;
}

const CHAT_HISTORY_SIDEBAR_KEY = "aiyo:chat-history-sidebar-expanded";
const CHAT_CONTEXT_PANEL_WIDTH_KEY = "aiyo:chat-context-panel-width";
const CHAT_CONTEXT_PANEL_MIN_WIDTH = 240;
const CHAT_CONTEXT_PANEL_MAX_WIDTH = 520;

function clampContextPanelWidth(width: number): number {
  return Math.min(CHAT_CONTEXT_PANEL_MAX_WIDTH, Math.max(CHAT_CONTEXT_PANEL_MIN_WIDTH, Math.round(width)));
}

function formatQuestionAnswerSummary(card: QuestionCardPayload, answers: ChatQuestionAnswer[]): string {
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
    const labels = values.map((value) => question?.options?.find((option) => option.value === value)?.label || value);
    return `${question?.question || answer.slot}：${labels.join("、") || "未填寫"}`;
  });
  return `已收到你的需求：\n${lines.map((line) => `- ${line}`).join("\n")}`;
}

function readPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function readBudgetAmountFromText(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const digits = value.match(/\d[\d,]*/g);
  if (!digits?.length) {
    return undefined;
  }
  const normalized = digits.join("").replace(/,/g, "");
  return readPositiveNumber(normalized);
}

function buildTripProfileFallback(input: {
  destination?: string;
  days?: number;
  budget?: number;
  transportPreference?: string | null;
  pace?: string | null;
  interests?: string[];
}): TripProfile | null {
  if (!input.destination?.trim() && !input.days && !input.budget) {
    return null;
  }
  return {
    destination: input.destination?.trim() || null,
    duration_days: input.days ?? null,
    duration_nights: input.days ? Math.max(0, input.days - 1) : null,
    departure_location: null,
    travel_dates: null,
    companions: null,
    traveler_count: null,
    budget: input.budget ? String(input.budget) : null,
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: input.interests || [],
    transportation: input.transportPreference || null,
    accommodation: null,
    visited_before: [],
    avoid_places: [],
    dietary_restrictions: [],
    disliked_activities: [],
    pace: input.pace || null,
    plan_integration: "direct_merge",
  };
}

function formatIsoDateLabel(value: string | undefined): string {
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

function normalizeDisplayText(value: string): string {
  return value.toLowerCase().replace(/臺/g, "台").replace(/\s+/g, "").trim();
}

function parseIsoLocalDate(value?: string): Date | null {
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

function toIsoLocalDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function shiftMonth(value: Date, delta: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + delta, 1);
}

function buildCalendarMatrix(month: Date): Array<{ iso: string; day: number; inMonth: boolean }> {
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

function uniqueByName<T extends { name: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = normalizeDisplayText(item.name);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function StatusStepList({ steps }: { steps: StatusStepPayload[] }) {
  if (!steps.length) {
    return null;
  }
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => step.status === "running"),
  );

  return (
    <div className="overflow-hidden rounded-[28px] border border-primary/10 bg-white/92 px-4 py-4 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/70">Planning Progress</p>
          <p className="mt-1 text-sm text-muted">AI 正在整理需求、查找路線並生成每日安排。</p>
        </div>
        <span className="rounded-full bg-primary/8 px-3 py-1 text-xs font-semibold text-primary">
          Step {Math.min(activeIndex + 1, steps.length)} / {steps.length}
        </span>
      </div>
      <div className="flex flex-wrap items-start gap-y-4">
        {steps.map((step, index) => {
          const isCompleted = step.status === "completed";
          const isRunning = step.status === "running";
          const lineFilled = isCompleted || (index < activeIndex && !steps.some((item) => item.status === "running"));
          return (
            <div key={`${step.label}_${index}`} className="flex min-w-[180px] flex-1 items-start">
              <div className="flex w-full items-start gap-3">
                <div className="flex min-w-[40px] flex-col items-center">
                  <motion.span
                    initial={{ scale: 0.92, opacity: 0.75 }}
                    animate={{
                      scale: isRunning ? [1, 1.08, 1] : 1,
                      opacity: 1,
                    }}
                    transition={{
                      duration: isRunning ? 1.4 : 0.25,
                      repeat: isRunning ? Number.POSITIVE_INFINITY : 0,
                      ease: "easeInOut",
                    }}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                      isCompleted
                        ? "border-primary bg-primary text-white shadow-[0_10px_30px_rgba(37,99,235,0.25)]"
                        : isRunning
                          ? "border-primary bg-white text-primary shadow-[0_10px_24px_rgba(37,99,235,0.18)]"
                          : "border-slate-300 bg-white text-slate-400",
                    )}
                  >
                    {isCompleted ? (
                      <Check className="size-4" aria-hidden />
                    ) : isRunning ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                    ) : (
                      index + 1
                    )}
                  </motion.span>
                  {index < steps.length - 1 ? (
                    <div className="mt-2 hidden h-px w-[calc(100vw/9)] min-w-[64px] max-w-[140px] overflow-hidden rounded-full bg-slate-200 sm:block">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: lineFilled ? "100%" : isRunning ? "62%" : "0%" }}
                        transition={{ duration: 0.45, ease: "easeOut" }}
                        className="h-full rounded-full bg-primary"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="pt-1">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isCompleted || isRunning ? "text-foreground" : "text-muted",
                    )}
                  >
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {isCompleted ? "已完成" : isRunning ? "進行中" : "等待前一步完成"}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const REVISION_ACTIONS = [
  "放慢步調",
  "改成自駕",
  "加入更多美食",
  "減少購物",
] as const;

function RevisionActionBar({
  disabled,
  onRevise,
}: {
  disabled?: boolean;
  onRevise: (instruction: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-2xl border border-border-light bg-white/80 p-3 shadow-soft">
      <p className="text-xs font-semibold text-muted">快速修改</p>
      <div className="flex flex-wrap gap-2">
        {REVISION_ACTIONS.map((action) => (
          <button
            key={action}
            type="button"
            disabled={disabled}
            onClick={() => onRevise(action)}
            className="rounded-full border border-border-light bg-white px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {action}
          </button>
        ))}
      </div>
    </div>
  );
}

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
      <span className="text-xs font-semibold text-muted">{label}</span>
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const nextVisible = parseIsoLocalDate(value) || parseIsoLocalDate(min) || new Date();
          setVisibleMonth(new Date(nextVisible.getFullYear(), nextVisible.getMonth(), 1));
          setOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between rounded-xl border border-border-light bg-white px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/40 focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>{formatIsoDateLabel(value)}</span>
        <CalendarDays className="size-4 text-primary" aria-hidden />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-20 mt-2 w-[286px] rounded-2xl border border-border-light bg-white p-3 shadow-[0_24px_60px_rgba(15,23,42,0.14)]">
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              disabled={disabled}
              onClick={() => setVisibleMonth((prev) => shiftMonth(prev, -1))}
              className="rounded-full border border-border-light p-1.5 text-slate-600 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <p className="text-sm font-semibold text-foreground">{monthLabel}</p>
            <button
              type="button"
              disabled={disabled}
              onClick={() => setVisibleMonth((prev) => shiftMonth(prev, 1))}
              className="rounded-full border border-border-light p-1.5 text-slate-600 transition-colors hover:border-primary/30 hover:bg-primary/5"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
          <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted">
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
                    "flex aspect-square items-center justify-center rounded-xl text-sm transition-colors",
                    selected
                      ? "bg-primary text-white shadow-[0_10px_24px_rgba(37,99,235,0.25)]"
                      : cell.inMonth
                        ? "bg-slate-50 text-slate-700 hover:bg-primary/8"
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

function QuestionCard({
  card,
  disabled,
  onSubmit,
}: {
  card: QuestionCardPayload;
  disabled?: boolean;
  onSubmit: (answers: ChatQuestionAnswer[], displayMessage: string) => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string | string[] | { start?: string; end?: string }>>({});

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
      const current = typeof prev[question.slot] === "object" && !Array.isArray(prev[question.slot])
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
    if (question.type === "multi_choice") {
      return Array.isArray(value) && value.length > 0;
    }
    if (question.type === "date_range") {
      return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (value.start || "").trim() &&
        (value.end || "").trim(),
      );
    }
    if (typeof value === "number") {
      return Number.isFinite(value);
    }
    return typeof value === "string" ? value.trim().length > 0 : false;
  });

  return (
    <div className="w-full space-y-4 rounded-2xl border border-border-light bg-white/90 p-4 shadow-soft">
      <h3 className="text-sm font-semibold leading-relaxed text-foreground">{card.title}</h3>
      <div className="space-y-4">
        {card.questions.map((question) => (
          <div key={question.slot} className="space-y-2">
            <p className="text-sm font-medium text-foreground">{question.question}</p>
            {question.type === "single_choice" ? (
              <div className="flex flex-wrap gap-2">
                {(question.options || []).map((option) => {
                  const selected = answers[question.slot] === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => setSingle(question, option.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-border-light bg-white text-foreground hover:bg-primary/5",
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
                        disabled={disabled}
                        onClick={() => setSingle(question, option.value)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          selected
                            ? "border-primary bg-primary text-white"
                            : "border-border-light bg-white text-foreground hover:bg-primary/5",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
                <input
                  type="text"
                  disabled={disabled}
                  value={
                    typeof answers[question.slot] === "string" &&
                    !(question.options || []).some((option) => option.value === answers[question.slot])
                      ? (answers[question.slot] as string)
                      : ""
                  }
                  onChange={(event) => setSingle(question, event.target.value)}
                  placeholder={question.placeholder || "自訂預算，例如：每人 25000，或總預算 80000"}
                  className="w-full rounded-xl border border-border-light bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            ) : question.type === "multi_choice" ? (
              <div className="flex flex-wrap gap-2">
                {(question.options || []).map((option) => {
                  const selected = Array.isArray(answers[question.slot]) && (answers[question.slot] as string[]).includes(option.value);
                  return (
                    <button
                      key={option.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => toggleMulti(question, option.value)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-border-light bg-white text-foreground hover:bg-primary/5",
                      )}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            ) : question.type === "date_range" ? (
              <div className="space-y-3 rounded-2xl border border-primary/10 bg-primary/[0.03] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <CalendarDateField
                    label="出發日期"
                    disabled={disabled}
                    value={
                      typeof answers[question.slot] === "object" && !Array.isArray(answers[question.slot])
                        ? ((answers[question.slot] as { start?: string; end?: string }).start || "")
                        : ""
                    }
                    onChange={(value) => setDateRange(question, "start", value)}
                  />
                  <CalendarDateField
                    label="返回日期"
                    disabled={disabled}
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
                <p className="flex items-center gap-2 text-xs text-muted">
                  <CalendarDays className="size-3.5 text-primary" aria-hidden />
                  兩個日期都由你自行選取，系統不會自動幫你推算回程日。
                </p>
              </div>
            ) : (
              <input
                type={question.type === "number" ? "number" : "text"}
                disabled={disabled}
                value={typeof answers[question.slot] === "string" ? (answers[question.slot] as string) : ""}
                onChange={(event) => setSingle(question, event.target.value)}
                placeholder={question.placeholder}
                className="w-full rounded-xl border border-border-light bg-white px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        disabled={disabled || !canSubmit}
        onClick={() => onSubmit(normalizedAnswers, formatQuestionAnswerSummary(card, normalizedAnswers))}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {disabled ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
        {card.action?.label || "繼續"}
      </button>
    </div>
  );
}

function TravelPlanCard({
  plan,
  onRevise,
  revisionDisabled,
}: {
  plan: TravelPlanResponse;
  onRevise: (instruction: string) => void;
  revisionDisabled?: boolean;
}) {
  const sources = plan.sources;
  const sourceEntries = Object.values(sources || {});
  const overviewDays = plan.summary_table.map((row, index) => {
    const day = plan.days[index];
    const routeNames = uniqueByName(day?.spots || []).map((spot) => spot.name).slice(0, 4);
    return {
      day: row.day,
      routeNames,
      theme: day?.theme || row.main_route,
      citations: row.citations,
    };
  });

  return (
    <div className="w-full space-y-5">
      <div className="overflow-hidden rounded-[28px] border border-border-light bg-white/92 shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
        <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.14),_transparent_36%),linear-gradient(135deg,rgba(255,255,255,0.98),rgba(248,250,252,0.96))] px-5 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <span className="inline-flex rounded-full border border-primary/15 bg-primary/5 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-primary">
                Final Plan
              </span>
              <h3 className="text-lg font-semibold tracking-tight text-foreground">{plan.title}</h3>
              <p className="max-w-2xl text-sm leading-relaxed text-muted">
                以每日動線、景點停留順序與餐食節奏整理成可直接採用的版本，右側行程與編輯頁會同步使用這份內容。
              </p>
            </div>
            <div className="grid min-w-[220px] gap-2 sm:grid-cols-2">
              {overviewDays.map((row) => (
                <div key={row.day} className="rounded-2xl border border-white/70 bg-white/75 px-3 py-3 shadow-[0_14px_35px_rgba(148,163,184,0.14)]">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/80">{row.day}</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{row.theme}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(row.routeNames.length ? row.routeNames : [row.theme]).slice(0, 4).map((name) => (
                      <span
                        key={`${row.day}_${name}`}
                        className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-700"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                  <CitationGroup citations={row.citations} sources={sources} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {plan.revision ? (
          <div className="border-t border-border-light bg-amber-50/70 px-5 py-4 text-xs text-slate-700">
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-semibold text-foreground">本次調整摘要</p>
              <span className="rounded-full bg-white px-2.5 py-1 font-mono text-[11px] text-muted">
                {plan.revision.revised_from}
              </span>
              {plan.revision.changed_days.length > 0 ? (
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600">
                  {plan.revision.changed_days.join("、")}
                </span>
              ) : null}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {plan.revision.change_summary.map((item, index) => (
                <span
                  key={`${index}_${item}`}
                  className="rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-medium text-slate-700"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-4">
        {plan.days.map((day) => (
          <section
            key={day.day}
            className="overflow-hidden rounded-[26px] border border-border-light bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(249,250,251,0.94))] shadow-[0_16px_44px_rgba(148,163,184,0.16)]"
          >
            <div className="border-b border-border-light bg-slate-50/80 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-primary px-3 py-1 text-xs font-semibold text-white">{day.day}</span>
                <h4 className="text-base font-semibold text-foreground">{day.theme}</h4>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {uniqueByName(day.spots).map((spot) => (
                  <span
                    key={`${day.day}_route_${spot.name}`}
                    className="rounded-full border border-primary/10 bg-white px-3 py-1 text-xs font-medium text-slate-700"
                  >
                    {spot.name}
                  </span>
                ))}
              </div>
              <CitationGroup citations={day.citations} sources={sources} />
            </div>

            <div className="grid gap-4 px-4 py-4 lg:grid-cols-[1.5fr_1fr]">
              <div className="space-y-4">
                {day.transportation.length > 0 && (
                  <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">交通策略</p>
                    <ul className="space-y-2 text-sm text-foreground">
                      {day.transportation.map((item, index) => (
                        <li key={`${day.day}_transport_${index}_${item.text}`} className="rounded-xl bg-white/80 px-3 py-2">
                          <p>{item.text}</p>
                          <CitationGroup citations={item.citations} sources={sources} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {uniqueByName(day.spots).length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {uniqueByName(day.spots).map((spot, index) => (
                      <motion.div
                        key={`${day.day}_spot_${index}_${spot.name}`}
                        initial={{ opacity: 0, y: 14 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, amount: 0.15 }}
                        transition={{ duration: 0.28, delay: index * 0.05 }}
                        className="rounded-2xl border border-white/80 bg-white p-4 shadow-[0_12px_30px_rgba(148,163,184,0.14)]"
                      >
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary/70">Spot {index + 1}</p>
                        <p className="mt-2 text-sm font-semibold text-foreground">{spot.name}</p>
                        <p className="mt-2 text-xs leading-6 text-muted">{spot.feature}</p>
                        <CitationGroup citations={spot.citations} sources={sources} />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {uniqueByName(day.food_recommendations).length > 0 && (
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">餐食安排</p>
                    <div className="space-y-2">
                      {uniqueByName(day.food_recommendations).map((food, index) => (
                        <div key={`${day.day}_food_${index}_${food.name}`} className="rounded-xl bg-white/85 px-3 py-3">
                          <p className="text-sm font-semibold text-foreground">{food.name}</p>
                          <p className="mt-1 text-xs leading-6 text-muted">{food.description}</p>
                          <CitationGroup citations={food.citations} sources={sources} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {day.tips.length > 0 && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700">提醒與備註</p>
                    <ul className="space-y-2">
                      {day.tips.map((tip, index) => (
                        <li key={`${day.day}_tip_${index}_${tip.text}`} className="rounded-xl bg-white/85 px-3 py-2 text-xs leading-6 text-muted">
                          <p>{tip.text}</p>
                          <CitationGroup citations={tip.citations} sources={sources} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </section>
        ))}
      </div>
      {(plan.weather_alerts.length > 0 || plan.event_alerts.length > 0 || plan.assumptions.length > 0) && (
        <div className="rounded-xl border border-border-light bg-white/70 p-3 text-xs leading-relaxed text-muted">
          {plan.weather_alerts.map((alert) => (
            <div key={`${alert.day}_${alert.message}`} className="mb-2 last:mb-0">
              <p>{`${alert.day}：${alert.message}`}</p>
              <CitationGroup citations={alert.citations} sources={sources} />
            </div>
          ))}
          {plan.event_alerts.map((alert, index) => (
            <div key={`${alert.day || "event"}_${index}`} className="mb-2 last:mb-0">
              <p>{alert.day ? `${alert.day}：${alert.message}` : alert.message}</p>
              <CitationGroup citations={alert.citations} sources={sources} />
            </div>
          ))}
          {plan.assumptions.map((item, index) => (
            <div key={`assumption_${index}_${item.text}`} className="mb-2 last:mb-0">
              <p>{item.text}</p>
              <CitationGroup citations={item.citations} sources={sources} />
            </div>
          ))}
        </div>
      )}
      {sourceEntries.length > 0 && (
        <div className="mt-5 rounded-xl border border-border-light bg-white/70 p-3">
          <p className="mb-2 text-xs font-semibold text-muted">資料來源</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {sourceEntries.map((source) => (
              <a
                key={source.source_id}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-border-light bg-white px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5"
              >
                <p className="text-sm font-medium text-foreground">{source.title}</p>
                <p className="mt-1 text-xs text-muted">{source.domain || source.provider}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted">{source.preview_text || source.snippet}</p>
              </a>
            ))}
          </div>
        </div>
      )}
      <RevisionActionBar disabled={revisionDisabled} onRevise={onRevise} />
    </div>
  );
}

export default function ChatPage() {
  const router = useRouter();
  const { status } = useSession();
  const [input, setInput] = useState("");
  const [recommendedVideos, setRecommendedVideos] = useState<VideoRecommendation[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecommendation | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [historySidebarExpanded, setHistorySidebarExpanded] = useState(true);
  const [tripProfile, setTripProfile] = useState<TripProfile | null>(null);
  const [streamingStatusSteps, setStreamingStatusSteps] = useState<StatusStepPayload[]>([]);
  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [tripPickerTrips, setTripPickerTrips] = useState<ItineraryListItem[]>([]);
  const [tripPickerLoading, setTripPickerLoading] = useState(false);
  const [tripPickerError, setTripPickerError] = useState<string | null>(null);
  const [tripPickerAction, setTripPickerAction] = useState<"new" | string | null>(null);
  const [expandedContextDays, setExpandedContextDays] = useState<Record<number, boolean>>({});
  const [contextPanelWidth, setContextPanelWidth] = useState(288);
  const [autoSummaryProgress, setAutoSummaryProgress] = useState<{ current: number; total: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const statusStreamRef = useRef<EventSource | null>(null);
  const videoSummaryQueueTokenRef = useRef(0);
  const videoSummaryInflightRef = useRef(new Map<string, Promise<VideoSummaryResult>>());
  const autoSummaryActiveRef = useRef(false);
  const hydratedConversationTripRef = useRef<string | null>(null);
  const {
    conversations,
    activeConversationId,
    messages,
    createConversation,
    setConversationTrip,
    selectConversation,
    deleteConversation,
    appendMessage,
    isSending,
    setIsSending,
    errorMessage,
    setErrorMessage,
  } = useChatStore();
  const tripStore = useTripStore();
  const userStore = useUserStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const setSummaryDiagnostics = useVideoStore((state) => state.setSummaryDiagnostics);
  const setIsSummarizing = useVideoStore((state) => state.setIsSummarizing);

  const tagConfigs = [
    { icon: MapPin, label: t.chat.tagDestination },
    { icon: CalendarDays, label: t.chat.tagDays },
    { icon: DollarSign, label: t.chat.tagBudget },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending, errorMessage]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_SIDEBAR_KEY);
      if (raw === "false") {
        setHistorySidebarExpanded(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_CONTEXT_PANEL_WIDTH_KEY);
      if (raw) {
        setContextPanelWidth(clampContextPanelWidth(Number(raw)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent("/chat")}`);
    }
  }, [router, status]);

  useEffect(() => () => {
    statusStreamRef.current?.close();
    videoSummaryQueueTokenRef.current += 1;
    videoSummaryInflightRef.current.clear();
  }, []);

  useEffect(() => {
    const firstDay = tripStore.itinerary[0]?.dayNumber;
    if (!firstDay) {
      setExpandedContextDays({});
      return;
    }
    setExpandedContextDays((prev) => {
      const next: Record<number, boolean> = {};
      for (const day of tripStore.itinerary) {
        next[day.dayNumber] = prev[day.dayNumber] ?? day.dayNumber === firstDay;
      }
      return next;
    });
  }, [tripStore.tripId, tripStore.itinerary]);

  const planningSnapshot = derivePlanningSnapshot({
    trip: tripStore,
    user: userStore,
  });
  const contextDestination =
    tripStore.destination.trim() ||
    tripStore.title.trim() ||
    tripProfile?.destination?.trim() ||
    (planningSnapshot.hasDestination ? planningSnapshot.destination : "");
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );
  const activeConversationTripId = activeConversation?.tripId?.trim() || "";
  const hasActiveItineraryContext = Boolean(
    activeConversationId &&
      activeConversationTripId &&
      activeConversationTripId === tripStore.tripId &&
      tripStore.tripId,
  );
  const hasContextPanel =
    (hasActiveItineraryContext || Boolean(activeConversationId && tripProfile)) &&
    (planningSnapshot.hasPlanningContext ||
      Boolean(contextDestination) ||
      Boolean(tripProfile?.duration_days) ||
      Boolean(tripProfile?.budget) ||
      tripStore.itinerary.length > 0);

  const extractedValues = [
    contextDestination || t.chat.valueUnset,
    tripStore.days > 0
      ? `${tripStore.days} ${t.chat.daysUnit}`
      : tripProfile?.duration_days
        ? `${tripProfile.duration_days} ${t.chat.daysUnit}`
      : t.chat.valueUnset,
    tripStore.budget > 0 || planningSnapshot.hasBudget
      ? `${t.chat.currencyPrefix}${(tripStore.budget || planningSnapshot.budget).toLocaleString()}`
      : tripProfile?.budget?.trim()
        ? tripProfile.budget.trim()
      : t.chat.valueUnset,
  ];

  useEffect(() => {
    const recoveredProfile =
      [...(activeConversation?.messages || messages)]
        .reverse()
        .find((message) => message.tripProfile)?.tripProfile ||
      buildTripProfileFallback({
        destination: tripStore.destination || planningSnapshot.destination,
        days: tripStore.days || planningSnapshot.days,
        budget: tripStore.budget || planningSnapshot.budget,
        transportPreference: userStore.preferredTransport || null,
        pace: userStore.travelPace || null,
        interests: userStore.interests,
      });
    if (recoveredProfile) {
      setTripProfile(recoveredProfile);
    }
  }, [
    activeConversation?.messages,
    messages,
    planningSnapshot.budget,
    planningSnapshot.days,
    planningSnapshot.destination,
    tripStore.budget,
    tripStore.days,
    tripStore.destination,
    userStore.interests,
    userStore.preferredTransport,
    userStore.travelPace,
  ]);

  useEffect(() => {
    if (!activeConversationId || !activeConversationTripId) {
      hydratedConversationTripRef.current = null;
      return;
    }
    if (activeConversationTripId === tripStore.tripId) {
      hydratedConversationTripRef.current = `${activeConversationId}:${activeConversationTripId}`;
      return;
    }
    const hydrationKey = `${activeConversationId}:${activeConversationTripId}`;
    if (hydratedConversationTripRef.current === hydrationKey) {
      return;
    }

    let cancelled = false;
    hydratedConversationTripRef.current = hydrationKey;
    void setActiveTrip(activeConversationTripId)
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          hydratedConversationTripRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, activeConversationTripId, tripStore.tripId]);
  const isCitationList = (
    sources: ChatMessage["sources"],
  ): sources is Array<{ title: string; url: string }> => Array.isArray(sources);

  function persistHistorySidebarExpanded(next: boolean) {
    setHistorySidebarExpanded(next);
    try {
      window.localStorage.setItem(CHAT_HISTORY_SIDEBAR_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  function toggleContextDay(dayNumber: number) {
    setExpandedContextDays((prev) => ({
      ...prev,
      [dayNumber]: !(prev[dayNumber] ?? false),
    }));
  }

  function stopAutoVideoSummaryQueue() {
    videoSummaryQueueTokenRef.current += 1;
    autoSummaryActiveRef.current = false;
    setAutoSummaryProgress(null);
    setIsLoadingVideos(false);
    setIsSummarizing(false);
  }

  function startAutoVideoSummaryQueue(videos: VideoRecommendation[], destination: string) {
    const hasPendingSummaries = videos
      .slice(0, 6)
      .some((video) => !shouldSkipClientVideoSummarize(video));
    if (!hasPendingSummaries) {
      return false;
    }

    const queueToken = videoSummaryQueueTokenRef.current + 1;
    videoSummaryQueueTokenRef.current = queueToken;
    autoSummaryActiveRef.current = false;
    setAutoSummaryProgress(null);
    void processRecommendedVideoSummaries(videos, destination, queueToken);
    return true;
  }

  function startContextPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = contextPanelWidth;
    let nextWidth = startWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampContextPanelWidth(startWidth + startX - moveEvent.clientX);
      setContextPanelWidth(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      try {
        window.localStorage.setItem(CHAT_CONTEXT_PANEL_WIDTH_KEY, String(nextWidth));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  async function openNewConversationPicker() {
    if (isSending || tripPickerLoading || tripPickerAction) {
      return;
    }
    setTripPickerOpen(true);
    setTripPickerError(null);
    setTripPickerLoading(true);
    try {
      const rows = await listTripsForLibrary("recent");
      setTripPickerTrips(rows);
    } catch (error) {
      setTripPickerError(error instanceof Error ? error.message : "無法載入行程清單。");
    } finally {
      setTripPickerLoading(false);
    }
  }

  function finishNewConversationSetup(tripId: string, title?: string) {
    createConversation(title, tripId);
    setInput("");
    setTripProfile(null);
    setTripPickerOpen(false);
    setTripPickerAction(null);
  }

  async function ensureTripPlanningContext(conversationTitle?: string) {
    const currentTripId = useTripStore.getState().tripId?.trim();
    const currentConversationId = useChatStore.getState().activeConversationId;
    const currentConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === currentConversationId);
    const conversationTripId = currentConversation?.tripId?.trim();

    if (currentTripId) {
      if (currentConversationId) {
        setConversationTrip(currentConversationId, currentTripId);
      }
      return currentTripId;
    }

    if (conversationTripId) {
      const snapshot = await setActiveTrip(conversationTripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      if (currentConversationId) {
        setConversationTrip(currentConversationId, conversationTripId);
      }
      return conversationTripId;
    }

    const created = await createNewTrip();
    const snapshot = await setActiveTrip(created.tripId);
    syncService.applyTripSwitch(snapshot);
    syncService.startRealtime(snapshot.collaboration?.roomId ?? null);

    const nextConversationId = useChatStore.getState().activeConversationId;
    if (nextConversationId) {
      setConversationTrip(nextConversationId, created.tripId);
    } else {
      createConversation(conversationTitle, created.tripId);
    }
    return created.tripId;
  }

  async function selectConversationForChat(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    selectConversation(conversationId);
    const tripId = conversation?.tripId;
    if (!tripId || tripId === useTripStore.getState().tripId) {
      return;
    }
    try {
      const snapshot = await setActiveTrip(tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
    } catch {
      pushToast({
        variant: "warning",
        title: "無法切換對話行程",
        description: "已切換對話，但目前仍使用原本的行程脈絡。",
      });
    }
  }

  async function startConversationWithTrip(tripId: string) {
    if (tripPickerAction) {
      return;
    }
    setTripPickerAction(tripId);
    setTripPickerError(null);
    try {
      const selectedTrip = tripPickerTrips.find((trip) => trip.id === tripId);
      if (tripId !== useTripStore.getState().tripId) {
        const snapshot = await setActiveTrip(tripId);
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      }
      finishNewConversationSetup(tripId, selectedTrip?.title);
    } catch (error) {
      setTripPickerError(error instanceof Error ? error.message : "無法切換行程。");
      setTripPickerAction(null);
    }
  }

  async function startConversationWithNewTrip() {
    if (tripPickerAction) {
      return;
    }
    setTripPickerAction("new");
    setTripPickerError(null);
    try {
      const created = await createNewTrip();
      const snapshot = await setActiveTrip(created.tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      finishNewConversationSetup(created.tripId);
    } catch (error) {
      setTripPickerError(error instanceof Error ? error.message : "無法建立新行程。");
      setTripPickerAction(null);
    }
  }

  function stopStatusStream() {
    logFrontendDebugEvent("chat-sse", "stream-stop");
    statusStreamRef.current?.close();
    statusStreamRef.current = null;
    setStreamingStatusSteps([]);
  }

  function startStatusStream() {
    stopStatusStream();
    const sessionId = `chat_${Date.now()}`;
    const processId = startFrontendDebugProcess("chat-sse", "監聽聊天進度 SSE", {
      sessionId,
    });
    const source = new EventSource(`/api/chat/stream/${encodeURIComponent(sessionId)}`);
    source.addEventListener("status_step", (event) => {
      try {
        const step = JSON.parse((event as MessageEvent<string>).data) as StatusStepPayload;
        updateFrontendDebugProcess(processId, "status-step", {
          sessionId,
          stepLabel: step.label,
          stepStatus: step.status,
        });
        setStreamingStatusSteps((prev) => {
          const next = prev.filter((item) => item.label !== step.label);
          return [...next, step];
        });
      } catch {
        /* ignore malformed SSE payload */
      }
    });
    source.onerror = () => {
      finishFrontendDebugProcess(processId, {
        sessionId,
        reason: "eventsource-closed",
      });
      source.close();
      if (statusStreamRef.current === source) {
        statusStreamRef.current = null;
      }
    };
    statusStreamRef.current = source;
    return { sessionId, processId };
  }

  async function handleSend(
    rawInput?: string,
    options?: {
      displayMessage?: string;
      displayAsAssistant?: boolean;
      questionAnswers?: ChatQuestionAnswer[];
      tripProfile?: TripProfile | null;
    },
  ) {
    const hasQuestionAnswers = Boolean(options?.questionAnswers?.length);
    const message = (rawInput || input).trim();
    if ((!message && !hasQuestionAnswers) || isSending) {
      return;
    }

    stopAutoVideoSummaryQueue();

    if (!options?.questionAnswers?.length) {
      applyPlanningUpdateToStores(extractPlanningUpdateFromText(message));
    }

    const planningSnapshot = derivePlanningSnapshot({
      trip: useTripStore.getState(),
      user: useUserStore.getState(),
    });
    const dateRange = extractIsoDateRangeFromText(message);

    const previousMessages = useChatStore.getState().messages;
    const displayMessage = options?.displayMessage || message;
    appendMessage(
      options?.displayAsAssistant
        ? buildAssistantLocalMessage(displayMessage)
        : buildUserMessage(displayMessage),
    );
    setInput("");
    setErrorMessage(null);
    setIsSending(true);
    const chatProcessId = startFrontendDebugProcess("chat-ui", "聊天送出流程", {
      messagePreview: (message || options?.displayMessage || "").slice(0, 80),
      hasQuestionAnswers,
      hasTripProfile: Boolean(options?.tripProfile ?? tripProfile),
    });
    const { sessionId: progressSessionId, processId: sseProcessId } = startStatusStream();

    try {
      const activeProfile =
        options?.tripProfile ??
        tripProfile ??
        buildTripProfileFallback({
          destination: tripStore.destination || planningSnapshot.destination,
          days: tripStore.days || planningSnapshot.days,
          budget: tripStore.budget || planningSnapshot.budget,
          transportPreference: userStore.preferredTransport || null,
          pace: userStore.travelPace || null,
          interests: userStore.interests,
        }) ??
        undefined;
      const shouldUseTripRevisionFlow =
        !hasQuestionAnswers &&
        !options?.displayAsAssistant &&
        Boolean(activeProfile) &&
        useTripStore.getState().itinerary.length > 0 &&
        isItineraryMutationCommand(message);

      if (shouldUseTripRevisionFlow && activeProfile) {
        const revisionProfile: TripProfile = {
          ...activeProfile,
          plan_integration: "direct_merge",
        };
        updateFrontendDebugProcess(chatProcessId, "trip-revision-reroute", {
          progressSessionId,
        });
        const response = await reviseTripPlan({
          instruction: message,
          tripProfile: revisionProfile,
          context: {
            destination: revisionProfile.destination || planningSnapshot.destination,
            days: revisionProfile.duration_days || planningSnapshot.days,
            budget: planningSnapshot.budget,
            itinerary: useTripStore.getState().itinerary,
            tripStartDate: revisionProfile.travel_dates?.start || undefined,
            tripEndDate: revisionProfile.travel_dates?.end || revisionProfile.travel_dates?.start || undefined,
            preferences: {
              interests: revisionProfile.preferences,
              pace:
                revisionProfile.pace === "relaxed" || revisionProfile.pace === "intensive"
                  ? revisionProfile.pace
                  : useUserStore.getState().travelPace || "moderate",
              transportPreference: revisionProfile.transportation || useUserStore.getState().preferredTransport,
              budget: planningSnapshot.budget,
            },
          },
          progressSessionId,
        });
        appendMessage(response.reply);
        if (response.tripProfile) {
          setTripProfile(response.tripProfile);
        }
        await ensureTripPlanningContext(
          response.tripProfile?.destination ||
            activeConversation?.title ||
            displayMessage,
        );
        if (response.itinerarySuggestion) {
          await applyGeneratedTripPlan(response);
        } else if (response.proposedChanges?.length) {
          await applyAiProposedChanges(response.proposedChanges, { navigate: false });
        } else {
          pushToast({
            variant: "warning",
            title: "沒有可套用的行程變更",
            description: "AI 已回覆，但這次沒有產生可直接同步到行程的修改內容。",
          });
        }
        updateFrontendDebugProcess(chatProcessId, "reply-received", {
          replyType: response.reply.responseType,
          replyId: response.reply.id,
          tripRevisionFlow: true,
        });
        finishFrontendDebugProcess(chatProcessId, {
          progressSessionId,
          finalReplyType: response.reply.responseType,
          tripRevisionFlow: true,
        });
        return;
      }

      updateFrontendDebugProcess(chatProcessId, "request-dispatched", {
        progressSessionId,
      });
      const response = await sendChatMessage({
        message,
        messages: previousMessages.slice(-10),
        context: {
          destination: planningSnapshot.destination,
          days: planningSnapshot.days,
          budget: planningSnapshot.budget,
          itinerary: useTripStore.getState().itinerary,
          tripStartDate: dateRange.tripStartDate,
          tripEndDate: dateRange.tripEndDate,
          preferences: {
            interests: useUserStore.getState().interests,
            pace: useUserStore.getState().travelPace || "moderate",
            transportPreference: useUserStore.getState().preferredTransport,
            budget: planningSnapshot.budget,
          },
        },
        structuredTravelPlanning: true,
        tripProfile: options?.tripProfile ?? tripProfile ?? undefined,
        questionAnswers: options?.questionAnswers,
        progressSessionId,
      });
      appendMessage(response.reply);
      if (response.tripProfile) {
        setTripProfile(response.tripProfile);
      }
      const shouldPersistPlanningResult =
        Boolean(response.itinerarySuggestion) ||
        Boolean(response.proposedChanges?.length && response.reply.responseType !== "question_card");
      if (shouldPersistPlanningResult && response.tripProfile?.plan_integration !== "self_merge") {
        await ensureTripPlanningContext(
          response.tripProfile?.destination ||
            activeConversation?.title ||
            displayMessage,
        );
      }
      const shouldDirectMergeGeneratedPlan =
        response.reply.responseType === "travel_plan" &&
        response.tripProfile?.plan_integration !== "self_merge";
      const shouldApplyItineraryUpdate =
        Boolean(useTripStore.getState().tripId) &&
        (isItineraryMutationCommand(message) || shouldDirectMergeGeneratedPlan);
      if (shouldApplyItineraryUpdate) {
        if (response.itinerarySuggestion) {
          await applyGeneratedTripPlan(response);
        } else if (response.proposedChanges?.length) {
          await applyAiProposedChanges(response.proposedChanges, { navigate: false });
        }
      } else if (
        response.reply.responseType === "travel_plan" &&
        response.tripProfile?.plan_integration === "self_merge"
      ) {
        pushToast({
          variant: "info",
          title: "已保留為建議行程",
          description: "你選擇了自行加入，所以目前只顯示建議內容，尚未直接修改現有行程。",
        });
      }
      updateFrontendDebugProcess(chatProcessId, "reply-received", {
        replyType: response.reply.responseType,
        replyId: response.reply.id,
      });

      if (shouldRecommendVideos(message)) {
        const videoSummaryQueueToken = videoSummaryQueueTokenRef.current + 1;
        videoSummaryQueueTokenRef.current = videoSummaryQueueToken;
        autoSummaryActiveRef.current = false;
        setAutoSummaryProgress(null);
        setIsLoadingVideos(true);
        setIsSummarizing(false);
        setVideoError(null);
        let autoSummaryStarted = false;
        try {
          updateFrontendDebugProcess(chatProcessId, "video-recommendation-start", {
            destination: planningSnapshot.destination,
          });
          const outcome = await fetchVideoRecommendations({
            destination: planningSnapshot.destination,
            keyword: message,
            days: planningSnapshot.days,
            preferences: useUserStore.getState().interests,
            limit: 6,
          });
          setRecommendedVideos(outcome.videos);
          autoSummaryStarted = outcome.videos
            .slice(0, 6)
            .some((video) => !shouldSkipClientVideoSummarize(video));
          updateFrontendDebugProcess(chatProcessId, "video-recommendation-complete", {
            resultCount: outcome.videos.length,
            source: outcome.source,
            titles: outcome.videos.slice(0, 6).map((video) => video.title),
            autoSummaryStarted,
          });
          if (autoSummaryStarted) {
            void processRecommendedVideoSummaries(
              outcome.videos,
              planningSnapshot.destination,
              videoSummaryQueueToken,
            );
          }
          if (outcome.source === "mock-fallback") {
            pushToast({
              variant: "warning",
              title: t.video.mockVideosTitle,
              description: outcome.fallbackReason || t.video.mockVideosDesc,
            });
          }
        } catch (error) {
          failFrontendDebugProcess(chatProcessId, error, {
            stage: "video-recommendation",
          });
          const description =
            error instanceof Error ? error.message : t.video.requestFailedGeneric;
          setVideoError(description);
          pushToast({
            variant: "error",
            title: t.video.requestFailed,
            description,
          });
        } finally {
          if (!autoSummaryStarted) {
            setIsLoadingVideos(false);
          }
        }
      } else {
        startAutoVideoSummaryQueue(recommendedVideos, planningSnapshot.destination);
      }
      finishFrontendDebugProcess(chatProcessId, {
        progressSessionId,
        finalReplyType: response.reply.responseType,
      });
    } catch (error) {
      failFrontendDebugProcess(chatProcessId, error, {
        progressSessionId,
      });
      const description =
        error instanceof Error ? error.message : t.chat.requestFailedGeneric;
      setErrorMessage(description);
      pushToast({
        variant: "error",
        title: t.chat.requestFailed,
        description,
        actionLabel: t.common.retry,
        action: () => void handleSend(message),
      });
    } finally {
      finishFrontendDebugProcess(sseProcessId, {
        progressSessionId,
        reason: "handleSend-finally",
      });
      stopStatusStream();
      setIsSending(false);
    }
  }

  async function handleRevisePlan(
    instruction: string,
    baseTripProfile?: TripProfile | null,
  ) {
    const activeProfile =
      baseTripProfile ||
      tripProfile ||
      buildTripProfileFallback({
        destination: tripStore.destination || planningSnapshot.destination,
        days: tripStore.days || planningSnapshot.days,
        budget: tripStore.budget || planningSnapshot.budget,
        transportPreference: userStore.preferredTransport || null,
        pace: userStore.travelPace || null,
        interests: userStore.interests,
      });
    if (!activeProfile || isSending) {
      return;
    }
    const revisionProfile: TripProfile = {
      ...activeProfile,
      plan_integration: "direct_merge",
    };

    appendMessage(buildUserMessage(`請幫我把行程調整成：${instruction}`));
    setErrorMessage(null);
    setIsSending(true);
    const reviseProcessId = startFrontendDebugProcess("trip-revise-ui", "前端送出行程修改", {
      instruction,
      destination: activeProfile.destination,
    });
    const { sessionId: progressSessionId, processId: sseProcessId } = startStatusStream();

    try {
      updateFrontendDebugProcess(reviseProcessId, "request-dispatched", {
        progressSessionId,
      });
      const response = await reviseTripPlan({
        instruction,
        tripProfile: revisionProfile,
        context: {
          destination: revisionProfile.destination || planningSnapshot.destination,
          days: revisionProfile.duration_days || planningSnapshot.days,
          budget: planningSnapshot.budget,
          itinerary: useTripStore.getState().itinerary,
          tripStartDate: revisionProfile.travel_dates?.start || undefined,
          tripEndDate: revisionProfile.travel_dates?.end || revisionProfile.travel_dates?.start || undefined,
          preferences: {
            interests: revisionProfile.preferences,
            pace:
              revisionProfile.pace === "relaxed" || revisionProfile.pace === "intensive"
                ? revisionProfile.pace
                : useUserStore.getState().travelPace || "moderate",
            transportPreference: revisionProfile.transportation || useUserStore.getState().preferredTransport,
            budget: planningSnapshot.budget,
          },
        },
        progressSessionId,
      });
      appendMessage(response.reply);
      if (response.tripProfile) {
        setTripProfile(response.tripProfile);
      }
      if (response.itinerarySuggestion) {
        await applyGeneratedTripPlan(response);
      } else if (response.proposedChanges?.length) {
        await applyAiProposedChanges(response.proposedChanges, { navigate: false });
      } else {
        pushToast({
          variant: "warning",
          title: "沒有可套用的行程變更",
          description: "AI 已回覆，但這次沒有產生可直接同步到行程的修改內容。",
        });
      }
      finishFrontendDebugProcess(reviseProcessId, {
        progressSessionId,
        replyType: response.reply.responseType,
      });
    } catch (error) {
      failFrontendDebugProcess(reviseProcessId, error, {
        progressSessionId,
      });
      const description =
        error instanceof Error ? error.message : t.chat.requestFailedGeneric;
      setErrorMessage(description);
      pushToast({
        variant: "error",
        title: t.chat.requestFailed,
        description,
      });
    } finally {
      finishFrontendDebugProcess(sseProcessId, {
        progressSessionId,
        reason: "handleRevisePlan-finally",
      });
      stopStatusStream();
      setIsSending(false);
    }
  }

  async function applyAiProposedChanges(
    changes: AiProposedChange[],
    options: { navigate?: boolean; silent?: boolean } = {},
  ) {
    if (!changes.length) {
      return;
    }
    let appliedCount = 0;
    const trip = useTripStore.getState();
    if (trip.itinerary.length === 0) {
      trip.addDay();
    }
    const days = useTripStore.getState().itinerary;
    const maxDay = Math.max(1, ...days.map((day) => day.dayNumber));
    for (const change of changes) {
      if (change.type === "add_itinerary_item") {
        const targetDay = Math.max(1, Math.floor(Number(change.day) || 1));
        while (!useTripStore.getState().itinerary.some((day) => day.dayNumber === targetDay)) {
          useTripStore.getState().addDay();
          if (useTripStore.getState().itinerary.length > Math.max(targetDay, maxDay + 3)) {
            break;
          }
        }
        useTripStore.getState().addItineraryItem(
          targetDay,
          buildItineraryItemFromAiChange({ ...change, day: targetDay }),
        );
        appliedCount += 1;
        continue;
      }

      const target = findItineraryItemTarget(change);
      if (!target) {
        continue;
      }
      if (change.type === "remove_itinerary_item") {
        useTripStore.getState().removeItineraryItem(target.dayNumber, target.item.id);
        appliedCount += 1;
        continue;
      }

      const patch: Partial<TripPlanItem> = {};
      if (change.time) {
        patch.time = change.time;
      }
      if (change.title) {
        patch.title = change.title;
      }
      if (change.notes !== undefined) {
        patch.notes = change.notes;
      }
      if (change.transport !== undefined) {
        patch.transport = change.transport;
      }
      if (change.locationName) {
        if (target.item.location) {
          patch.location = {
            ...target.item.location,
            name: change.locationName,
          };
        } else if (!change.notes) {
          patch.notes = [target.item.notes || "", `地點：${change.locationName}`].filter(Boolean).join("\n");
        }
      }
      if (Object.keys(patch).length > 0) {
        useTripStore.getState().updateItineraryItem(target.dayNumber, target.item.id, patch);
        appliedCount += 1;
      }
    }

    if (appliedCount > 0) {
      await syncService.flushTripSyncNow({ force: true });
      if (!options.silent) {
        pushToast({
          variant: "success",
          title: "已套用 AI 建議",
          description: `已更新 ${appliedCount} 筆行程內容。`,
        });
      }
      if (options.navigate ?? true) {
        router.push("/itinerary");
      }
    } else if (!options.silent) {
      pushToast({
        variant: "warning",
        title: "找不到可套用的行程項目",
        description: "AI 回覆了修改建議，但目前行程中沒有找到對應項目。",
      });
    }
  }

  async function applyGeneratedTripPlan(
    response: Awaited<ReturnType<typeof reviseTripPlan>>,
    options: { silent?: boolean } = {},
  ) {
    if (!response.itinerarySuggestion) {
      return false;
    }
    const currentTrip = useTripStore.getState();
    currentTrip.replaceTripPlan(response.itinerarySuggestion, {
      destination: currentTrip.destination || response.tripProfile?.destination || planningSnapshot.destination,
      days: response.itinerarySuggestion.days.length,
      budget:
        currentTrip.budget ||
        planningSnapshot.budget ||
        readBudgetAmountFromText(response.tripProfile?.budget),
      title: currentTrip.title || response.tripProfile?.destination || currentTrip.destination,
    });
    await syncService.flushTripSyncNow({ force: true });
    if (!options.silent) {
      pushToast({
        variant: "success",
        title: "已更新行程",
        description: "AI 已把修改後的行程同步到目前行程。",
      });
    }
    return true;
  }

  function applyVideoSummaryResult(sourceVideo: VideoRecommendation, result: VideoSummaryResult) {
    setRecommendedVideos((videos) =>
      videos.map((item) => (videoMatches(item, sourceVideo) ? result.video : item)),
    );
    setSelectedVideo((current) => (videoMatches(current, sourceVideo) ? result.video : current));
  }

  function buildSummaryDiagnostics(result: VideoSummaryResult) {
    return {
      transcriptSource: result.transcriptSource,
      summarySource: result.summarySource,
      segmentSource: result.segmentSource,
      captionLanguage: result.debug?.captionLanguage,
      captionKind: result.debug?.captionKind,
      captionSource: result.debug?.captionSource,
      mapsProvenance: result.mapsProvenance,
      geocodeWarnings: result.geocodeWarnings,
      summaryUnavailable: result.summaryUnavailable,
      unavailableReason: result.unavailableReason,
    };
  }

  async function summarizeVideoOnce(input: {
    video: VideoRecommendation;
    destination: string;
    refresh?: boolean;
    debug?: boolean;
  }) {
    const key = buildVideoSummaryKey({
      videoId: input.video.videoId,
      destination: input.destination,
      refresh: input.refresh,
    });
    const existing = videoSummaryInflightRef.current.get(key);
    if (existing) {
      return existing;
    }
    const request = summarizeVideo({
      videoId: input.video.videoId,
      title: input.video.title,
      destination: input.destination,
      refresh: input.refresh,
      debug: input.debug,
    }).finally(() => {
      videoSummaryInflightRef.current.delete(key);
    });
    videoSummaryInflightRef.current.set(key, request);
    return request;
  }

  async function processRecommendedVideoSummaries(
    videos: VideoRecommendation[],
    destination: string,
    queueToken: number,
  ) {
    const queue = videos.slice(0, 6).filter((video) => !shouldSkipClientVideoSummarize(video));
    if (queue.length === 0) {
      return;
    }

    autoSummaryActiveRef.current = true;
    setAutoSummaryProgress({ current: 0, total: queue.length });
    setIsLoadingVideos(true);
    setIsSummarizing(true);

    try {
      for (let index = 0; index < queue.length; index += 1) {
        if (videoSummaryQueueTokenRef.current !== queueToken) {
          return;
        }
        const video = queue[index];
        setAutoSummaryProgress({ current: index + 1, total: queue.length });
        try {
          const result = await summarizeVideoOnce({
            video,
            destination,
            debug: false,
          });
          if (videoSummaryQueueTokenRef.current !== queueToken) {
            return;
          }
          applyVideoSummaryResult(video, result);
        } catch (error) {
          logFrontendDebugEvent("chat-video", "auto-summary-failed", {
            videoId: video.videoId,
            title: video.title,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      if (videoSummaryQueueTokenRef.current === queueToken) {
        autoSummaryActiveRef.current = false;
        setAutoSummaryProgress(null);
        setIsLoadingVideos(false);
        setIsSummarizing(false);
      }
    }
  }

  async function openVideoSummary(video: VideoRecommendation) {
    setSummaryDiagnostics(null);
    setSelectedVideo(video);
    logFrontendDebugEvent("chat-video", "open-summary-click", {
      videoId: video.videoId,
      title: video.title,
      skipClientSummary: shouldSkipClientVideoSummarize(video),
    });

    if (shouldSkipClientVideoSummarize(video)) {
      return;
    }

    setIsLoadingVideos(true);
    setIsSummarizing(true);
    try {
      const result = await summarizeVideoOnce({
        video,
        destination: planningSnapshot.destination,
      });
      applyVideoSummaryResult(video, result);
      setSummaryDiagnostics(buildSummaryDiagnostics(result));
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
      });
    } finally {
      if (!autoSummaryActiveRef.current) {
        setIsLoadingVideos(false);
        setIsSummarizing(false);
      }
    }
  }

  async function refreshVideoSummary(video: VideoRecommendation) {
    if (!video.videoId?.trim()) {
      return;
    }
    setSummaryDiagnostics(null);
    setIsLoadingVideos(true);
    setIsSummarizing(true);
    logFrontendDebugEvent("chat-video", "refresh-summary-click", {
      videoId: video.videoId,
      title: video.title,
    });
    try {
      const result = await summarizeVideoOnce({
        video,
        destination: planningSnapshot.destination,
        refresh: true,
      });
      applyVideoSummaryResult(video, result);
      setSummaryDiagnostics(buildSummaryDiagnostics(result));
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
      });
    } finally {
      if (!autoSummaryActiveRef.current) {
        setIsLoadingVideos(false);
        setIsSummarizing(false);
      }
    }
  }

  const emptyChatHint =
    status === "authenticated" ? t.chat.emptyHintAuthed : t.chat.emptyHintGuest;

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <p className="text-sm text-muted">{t.login.suspenseFallback}</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 lg:h-screen">
      {tripPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-trip-picker-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-border-light bg-white shadow-2xl"
          >
            <div className="border-b border-border-light px-5 py-4">
              <p id="chat-trip-picker-title" className="text-base font-semibold text-foreground">
                和AI聊聊你的行程
              </p>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
              <button
                type="button"
                disabled={Boolean(tripPickerAction)}
                onClick={() => void startConversationWithNewTrip()}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-semibold text-primary">
                    開始新旅程
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    這個對話會從空白行程開始，後續套用 AI 建議時會儲存在新行程中。
                  </span>
                </span>
                {tripPickerAction === "new" ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden />
                ) : (
                  <Plus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                )}
              </button>

              {tripPickerLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-4 py-3 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  載入行程清單中…
                </div>
              ) : tripPickerTrips.length > 0 ? (
                <div className="space-y-2">
                  {tripPickerTrips.map((trip) => {
                    const isCurrentTrip = trip.id === tripStore.tripId;
                    const isSwitching = tripPickerAction === trip.id;
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        disabled={Boolean(tripPickerAction)}
                        onClick={() => void startConversationWithTrip(trip.id)}
                        className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border-light bg-white px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {trip.title}
                            </span>
                            {isCurrentTrip && (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                目前
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {trip.destination} · {trip.days} 天 · 最近編輯 {formatTripUpdatedDate(trip.updatedAt)}
                          </span>
                        </span>
                        {isSwitching && (
                          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-4 py-5 text-center text-sm text-muted">
                  目前沒有可選擇的既有行程。
                </div>
              )}

              {tripPickerError && (
                <p className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {tripPickerError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border-light px-5 py-4">
              <button
                type="button"
                disabled={Boolean(tripPickerAction)}
                onClick={() => setTripPickerOpen(false)}
                className="rounded-xl border border-border-light bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-cream/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <aside
        className={cn(
          "hidden min-h-0 shrink-0 flex-col border-r border-border-light bg-surface/70 transition-[width,padding] duration-200 ease-out md:flex",
          historySidebarExpanded ? "w-72 p-4" : "w-[52px] items-center px-2 py-4",
        )}
      >
        {!historySidebarExpanded ? (
          <div className="flex flex-1 flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => persistHistorySidebarExpanded(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-foreground transition-colors hover:bg-cream/60"
              aria-expanded={false}
              title={t.chat.expandHistorySidebar}
              aria-label={t.chat.expandHistorySidebar}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => void openNewConversationPicker()}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark"
              title={t.chat.newConversationAria}
              aria-label={t.chat.newConversationAria}
            >
              <Plus className="size-4" aria-hidden />
            </button>
            <div className="flex flex-1 flex-col items-center pt-1">
              <History className="size-4 text-muted" aria-hidden />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start gap-2">
              <button
                type="button"
                onClick={() => persistHistorySidebarExpanded(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-foreground transition-colors hover:bg-cream/60"
                aria-expanded={true}
                aria-controls="chat-history-sidebar-panel"
                title={t.chat.collapseHistorySidebar}
                aria-label={t.chat.collapseHistorySidebar}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <div id="chat-history-sidebar-panel" className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <History className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{t.chat.sidebarTitle}</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={() => void openNewConversationPicker()}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark"
                aria-label={t.chat.newConversationAria}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-[3px]">
              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-4 py-6 text-center text-xs text-muted">
                  {t.chat.emptyConversationsHint}
                </div>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`group relative rounded-2xl border transition-colors ${
                      conversation.id === activeConversationId
                        ? "rainbow-border bg-primary/10"
                        : "border-border-light bg-surface hover:bg-cream/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void selectConversationForChat(conversation.id)}
                      className="w-full rounded-2xl px-3 py-3 pr-10 text-left"
                    >
                      <p className="truncate text-sm font-medium text-foreground">{conversation.title}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {t.chat.messagesCount.replace("{n}", String(conversation.messages.length))} ·{" "}
                        {new Date(conversation.updatedAt).toLocaleDateString("zh-TW")}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 z-[1] flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-red-600 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100"
                      aria-label={t.chat.deleteConversationAria}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteConversation(conversation.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <PastelRainbowBackground />
        <div className="relative z-10 border-b border-border-light bg-white/60 px-6 py-4 backdrop-blur-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="font-semibold text-foreground">{t.chat.pageTitle}</h1>
            </div>
            <button
              type="button"
              onClick={() => void openNewConversationPicker()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-light bg-white/70 px-3 py-2 text-xs font-medium text-foreground backdrop-blur-sm transition-colors hover:bg-white/90 md:hidden"
            >
              <Plus className="size-3.5" aria-hidden />
              {t.chat.newConversation}
            </button>
          </div>
        </div>
        {conversations.length > 0 && (
          <div className="relative z-10 flex gap-2 overflow-x-auto border-b border-border-light bg-white/40 px-4 py-3 backdrop-blur-sm md:hidden">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => void selectConversationForChat(conversation.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  conversation.id === activeConversationId
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border-light bg-white/60 text-muted"
                }`}
              >
                {conversation.title}
              </button>
            ))}
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !isSending && !errorMessage && (
            <div className="rounded-2xl border border-dashed border-border-light bg-white/60 px-4 py-8 text-center text-sm text-muted backdrop-blur-sm">
              <p className="font-medium text-foreground">{t.chat.emptyTitle}</p>
              <p className="mt-2 text-xs">{emptyChatHint}</p>
            </div>
          )}

          {messages.map((message, index) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              data-testid={message.role === "user" ? "chat-message-user" : "chat-message-ai"}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={cn(
                  "flex items-end gap-2",
                  message.responseType === "question_card" || message.responseType === "travel_plan" || message.responseType === "status_step"
                    ? "w-full max-w-4xl"
                    : "max-w-[70%]",
                  message.role === "user" ? "flex-row-reverse" : ""
                )}
              >
                <div
                  className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-secondary to-primary"
                      : "bg-gradient-to-br from-lavender to-primary"
                  }`}
                >
                  {message.role === "user" ? t.chat.userShort : t.chat.aiShort}
                </div>

                <div>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "rounded-br-md bg-primary text-white"
                        : message.responseType === "question_card" || message.responseType === "travel_plan" || message.responseType === "status_step"
                          ? "rounded-bl-md bg-transparent p-0 text-foreground"
                          : "rounded-bl-md border border-border-light bg-white/80 text-foreground shadow-soft backdrop-blur-md"
                    }`}
                  >
                    {message.responseType === "question_card" && message.questionCard ? (
                      <QuestionCard
                        card={message.questionCard}
                        disabled={isSending}
                        onSubmit={(answers, displayMessage) =>
                          void handleSend("", {
                            displayMessage,
                            displayAsAssistant: true,
                            questionAnswers: answers,
                            tripProfile: message.tripProfile || tripProfile,
                          })
                        }
                      />
                    ) : message.responseType === "travel_plan" && message.travelPlan ? (
                      <div className="space-y-3">
                        {message.statusSteps?.length ? <StatusStepList steps={message.statusSteps} /> : null}
                        <TravelPlanCard
                          plan={message.travelPlan}
                          revisionDisabled={isSending}
                          onRevise={(instruction) => void handleRevisePlan(instruction, message.tripProfile || tripProfile)}
                        />
                      </div>
                    ) : message.responseType === "status_step" && message.statusSteps?.length ? (
                      <div className="rounded-2xl border border-border-light bg-white/80 px-4 py-3 shadow-soft backdrop-blur-md">
                        <StatusStepList steps={message.statusSteps} />
                      </div>
                    ) : (
                      <MarkdownMessage
                        content={message.content}
                        inverted={message.role === "user"}
                      />
                    )}
                  </div>
                  <p
                    className={`mt-1 text-[10px] text-muted ${
                      message.role === "user" ? "text-right" : ""
                    }`}
                  >
                    {message.timestamp}
                  </p>
                  {message.role !== "user" && isCitationList(message.sources) && message.sources.length > 0 && (
                    <div className="mt-1.5 space-y-1 text-[11px] text-muted">
                      {message.sources.slice(0, 3).map((source) => (
                        <p key={`${message.id}_${source.url}`}>
                          來源：
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-primary hover:underline"
                          >
                            {source.title}
                          </a>
                        </p>
                      ))}
                    </div>
                  )}
                  {message.role !== "user" && (message.proposedChanges || []).length > 0 && (
                    <button
                      type="button"
                      data-testid="chat-apply-proposed-changes"
                      onClick={() => void applyAiProposedChanges(message.proposedChanges || [])}
                      className="mt-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
                    >
                      套用建議到行程
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {isSending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-lavender to-primary text-xs text-white">
                {t.chat.aiShort}
              </div>
              <div className="rounded-2xl rounded-bl-md border border-border-light bg-white/80 px-4 py-3 shadow-soft backdrop-blur-md">
                <StatusStepList
                  steps={
                    streamingStatusSteps.length
                      ? streamingStatusSteps
                      : [
                          { type: "status_step", label: "整理行程需求", status: "running" },
                          { type: "status_step", label: "判斷是否需要查詢即時資訊", status: "pending" },
                          { type: "status_step", label: "搜尋景點、交通與美食資訊", status: "pending" },
                          { type: "status_step", label: "整理每日路線、交通時間與景點順序", status: "pending" },
                        ]
                  }
                />
              </div>
            </motion.div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger backdrop-blur-sm">
              {errorMessage}
            </div>
          )}

          {(isLoadingVideos || videoError || recommendedVideos.length > 0) && (
            <section className="rounded-2xl border border-border-light bg-white/80 px-4 py-4 shadow-soft backdrop-blur-md">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">AI 推薦影片</h2>
                  {autoSummaryProgress && (
                    <p className="mt-1 text-xs text-muted">
                      正在依序處理影片資料 {autoSummaryProgress.current}/{autoSummaryProgress.total}
                    </p>
                  )}
                </div>
                {isLoadingVideos && <Loader2 className="size-4 animate-spin text-primary" aria-hidden />}
              </div>
              {videoError && (
                <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {videoError}
                </p>
              )}
              {recommendedVideos.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {recommendedVideos.map((video, index) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      index={index}
                      onClick={() => void openVideoSummary(video)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          <div ref={messagesEndRef} aria-hidden className="h-px shrink-0" />
        </div>

        <div className="relative z-10 px-6 pb-6 pt-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border-light bg-white/80 px-4 py-2 shadow-soft backdrop-blur-md">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSend()}
              placeholder={t.chat.placeholder}
              data-testid="chat-input"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none"
            />

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              data-testid="chat-send-button"
              className="flex size-10 cursor-pointer items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t.floatingChat.sendAria}
            >
              <Send className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

        <div
          className="relative hidden shrink-0 overflow-y-auto border-l border-border-light bg-surface/50 p-5 lg:block"
          style={{ width: contextPanelWidth }}
        >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="調整目前行程脈絡寬度"
          title="拖曳調整寬度"
          onPointerDown={startContextPanelResize}
          className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/20"
        />
        <h3 className="mb-4 text-sm font-semibold text-foreground">{t.chat.contextTitle}</h3>

        {hasContextPanel ? (
          <div className="flex flex-col gap-4">
            {tagConfigs.map((tag, index) => {
              const Icon = tag.icon;
              return (
                <button
                  type="button"
                  key={tag.label}
                  onClick={() => router.push("/profile")}
                  className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <Icon className="size-4 flex-shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted">{tag.label}</p>
                    <p className="truncate text-sm font-medium text-foreground">{extractedValues[index]}</p>
                  </div>
                </button>
              );
            })}

            <div className="rounded-2xl border border-border-light bg-white/70 p-3 shadow-soft">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Heart className="size-4 shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted">{t.chat.tagItinerary}</p>
                    <p className="truncate text-sm font-semibold text-foreground">
                      {tripStore.itinerary.length > 0
                        ? `${tripStore.itinerary.length} 天行程`
                        : t.chat.valueUnset}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/itinerary")}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  編輯
                </button>
              </div>

              {tripStore.itinerary.length > 0 ? (
                <div className="space-y-2">
                  {tripStore.itinerary.map((day, index) => {
                    const displayOrdinal = index + 1;
                    const expanded = expandedContextDays[day.dayNumber] ?? displayOrdinal === 1;
                    return (
                      <div
                        key={day.dayNumber}
                        className="overflow-hidden rounded-xl border border-border-light bg-surface"
                      >
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggleContextDay(day.dayNumber)}
                          className="flex w-full items-center justify-between gap-2 bg-gradient-to-r from-primary/8 via-surface to-surface px-3 py-2.5 text-left transition-colors hover:bg-primary/5"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
                              D{displayOrdinal}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground">
                                第 {displayOrdinal} 天
                              </span>
                              <span className="block truncate text-[11px] text-muted">
                                {day.theme && !/^Day\s*\d+$/i.test(day.theme.trim())
                                  ? day.theme
                                  : `${day.items.length} 個活動`}
                              </span>
                            </span>
                          </div>
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-muted transition-transform",
                              expanded ? "rotate-180" : "",
                            )}
                            aria-hidden
                          />
                        </button>

                        {expanded && (
                          <div className="space-y-2 border-t border-border-light p-3">
                            {day.items.length > 0 ? (
                              day.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-xl border border-border-light bg-white px-3 py-2"
                                >
                                  <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
                                    <span className="mt-0.5 inline-flex w-14 shrink-0 justify-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                      {item.time}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold text-foreground">
                                        {item.title}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-dashed border-border-light bg-cream/30 px-3 py-4 text-center text-xs text-muted">
                                尚未安排活動
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border-light bg-cream/30 px-3 py-4 text-center text-xs text-muted">
                  尚未建立每日行程
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-light bg-cream/30 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">{t.chat.contextEmptyTitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.chat.contextEmptyBody}</p>
          </div>
        )}
      </div>

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={() => setSelectedVideo(null)}
        onRefreshSummary={
          selectedVideo?.videoId ? () => refreshVideoSummary(selectedVideo) : undefined
        }
      />
    </div>
  );
}
