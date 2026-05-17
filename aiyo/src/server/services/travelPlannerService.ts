import { filterProposedChangesByVerifiedPlaces } from "@/server/ai/placeNameMatch";
import { chatWithOllama, OllamaRequestError, type OllamaMessage } from "@/server/ai/ollamaClient";
import {
  buildChatPrompt,
  buildChatResearchPlanningPrompt,
  buildItineraryPrompt,
  buildMapPlanningPrompt,
  detectResponseLanguage,
} from "@/server/ai/promptBuilder";
import { serverConfig } from "@/server/config";
import { shouldUseWebSearch } from "@/server/search/searchIntent";
import { searchWeb, type WebSearchResult } from "@/server/search/searxngClient";
import { mergeChatSources, normalizeWebSearchSources, pickCitationIdsForText } from "@/server/chat/sourceNormalization";
import { registerChatSources } from "@/server/chat/sourcePreviewStore";
import { publishChatProgress } from "@/server/chat/chatProgressStore";
import { applyRevisionInstructionToProfile } from "@/server/chat/tripRevision";
import {
  buildDefaultTravelToolRequests,
  buildTripPlanResearchRequests,
  executeTravelToolRequests,
  parseTravelToolRequestsFromModel,
} from "@/server/services/travelResearchTools";
import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import { parseTripPlanResponse, StructuredOutputError } from "@/server/ai/responseParser";
import type {
  AiProposedChange,
  ChatContext,
  ChatMessage,
  ChatQuestionAnswer,
  ChatSource,
  CitationText,
  ChatResponsePayload,
  QuestionCardPayload,
  StatusStepPayload,
  TravelPlanResponse,
  TravelPlanRevisionMeta,
  TripProfile,
  TripPlanDay,
  TripPlanRequest,
  TripPlanResult,
} from "@/types";

function normalizeHistory(
  context?: ChatContext,
  language: "traditional-chinese" | "japanese" | "english" = "english",
): OllamaMessage[] {
  if (!context?.itinerary?.length) {
    return [];
  }

  const itinerarySummary = context.itinerary
    .map(
      (day) =>
        `Day ${day.dayNumber}: ${day.items
          .map((item) => `${item.time} ${item.title}`)
          .join(", ")}`,
    )
    .join("\n");

  return [
    {
      role: "assistant",
      content:
        language === "traditional-chinese"
          ? `目前行程脈絡：\n${itinerarySummary}`
          : language === "japanese"
            ? `現在の旅程コンテキスト:\n${itinerarySummary}`
            : `Current itinerary context:\n${itinerarySummary}`,
    },
  ];
}

function normalizeConversationHistory(messages?: ChatMessage[]): OllamaMessage[] {
  if (!messages?.length) {
    return [];
  }

  return messages
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "ai")
    .slice(-8)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));
}

function sanitizeAssistantReply(content: string): string {
  return content
    .replace(
      /建議你在\s*(?:YouTube|Youtube|youtube)(?:\s*或\s*(?:Instagram|IG|instagram))?\s*搜尋以下關鍵字[，,、：:\s\S]*?(?:\n\n|$)/g,
      "",
    )
    .replace(
      /(?:你可以|建議你).*?(?:YouTube|Youtube|youtube|Instagram|IG|instagram).*?搜尋.*?(?:視覺想像|視覺印象).*?(?:。|\n|$)/g,
      "",
    )
    .trim();
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const first = raw.indexOf("{");
  const last = raw.lastIndexOf("}");
  if (first < 0 || last <= first) {
    return null;
  }
  try {
    return JSON.parse(raw.slice(first, last + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function normalizeProposedChange(value: unknown): AiProposedChange | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  const type = String(record.type || "").trim();
  const title = String(record.title || record.locationName || "").trim();
  const day = Number(record.day ?? record.dayNumber ?? 1);
  const rawTime = String(record.time || "").trim();
  const normalizedTime = /^\d{1,2}:\d{2}$/.test(rawTime) ? rawTime.padStart(5, "0") : undefined;
  if (type === "update_itinerary_item") {
    const itemId = String(record.itemId || record.id || "").trim();
    const targetTitle = String(record.targetTitle || record.originalTitle || "").trim();
    if (!itemId && !targetTitle) {
      return null;
    }
    return {
      type: "update_itinerary_item",
      day: Number.isFinite(day) && day > 0 ? Math.floor(day) : undefined,
      itemId: itemId || undefined,
      targetTitle: targetTitle || undefined,
      time: normalizedTime,
      title: title || undefined,
      locationName: record.locationName ? String(record.locationName) : undefined,
      notes: record.notes ? String(record.notes) : undefined,
      transport: record.transport ? String(record.transport) : undefined,
      reason: record.reason ? String(record.reason) : undefined,
      source: "ai-chat",
    };
  }
  if (type === "remove_itinerary_item") {
    const itemId = String(record.itemId || record.id || "").trim();
    const targetTitle = String(record.targetTitle || record.title || record.locationName || "").trim();
    if (!itemId && !targetTitle) {
      return null;
    }
    return {
      type: "remove_itinerary_item",
      day: Number.isFinite(day) && day > 0 ? Math.floor(day) : undefined,
      itemId: itemId || undefined,
      targetTitle: targetTitle || undefined,
      reason: record.reason ? String(record.reason) : undefined,
      source: "ai-chat",
    };
  }
  if (type !== "add_itinerary_item" || !title) {
    return null;
  }
  return {
    type: "add_itinerary_item",
    day: Number.isFinite(day) && day > 0 ? Math.floor(day) : 1,
    time: normalizedTime || "18:30",
    title,
    locationName: record.locationName ? String(record.locationName) : title,
    notes: record.notes ? String(record.notes) : undefined,
    reason: record.reason ? String(record.reason) : undefined,
    source: "ai-chat",
  };
}

function parseStructuredChatOutput(raw: string): { replyText: string; proposedChanges: AiProposedChange[] } {
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    return { replyText: sanitizeAssistantReply(raw) || raw.trim(), proposedChanges: [] };
  }
  const replyText = String(parsed.replyText || parsed.reply || parsed.message || "").trim();
  const proposedChanges = Array.isArray(parsed.proposedChanges)
    ? parsed.proposedChanges.map(normalizeProposedChange).filter((item): item is AiProposedChange => Boolean(item))
    : [];
  return {
    replyText: sanitizeAssistantReply(replyText || raw) || raw.trim(),
    proposedChanges,
  };
}

function isCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

type WebSearchBundle = {
  results: WebSearchResult[];
  digest: string;
  warning?: string;
};

type ProgressStepInput = Omit<StatusStepPayload, "type">;

function publishProgressStep(
  progressSessionId: string | undefined,
  step: ProgressStepInput,
): void {
  if (!progressSessionId) {
    return;
  }
  const timestamp = new Date().toISOString();
  publishChatProgress(progressSessionId, {
    type: "status_step",
    ...step,
    startedAt: step.startedAt || (step.status === "running" ? timestamp : undefined),
    completedAt: step.status === "completed" || step.status === "failed" ? step.completedAt || timestamp : undefined,
  });
}

function formatWebSearchDigest(results: WebSearchResult[]): string {
  return results
    .map((result, index) => {
      const lines = [
        `${index + 1}. Title: ${result.title}`,
        `   URL: ${result.url}`,
        `   Snippet: ${result.content || "(no snippet)"}`,
      ];
      return lines.join("\n");
    })
    .join("\n\n")
    .slice(0, 10_000);
}

function toCitationList(results: WebSearchResult[], max: number): Array<{ title: string; url: string }> {
  return results.slice(0, max).map((result) => ({ title: result.title, url: result.url }));
}

const CHINESE_NUMBERS: Record<string, number> = {
  一: 1,
  二: 2,
  兩: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10,
};

function nowChatTimestamp(): string {
  return new Date().toLocaleTimeString("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function emptyTripProfile(): TripProfile {
  return {
    destination: null,
    duration_days: null,
    duration_nights: null,
    departure_location: null,
    travel_dates: null,
    companions: null,
    traveler_count: null,
    budget: null,
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: [],
    transportation: null,
    accommodation: null,
    visited_before: [],
    avoid_places: [],
    dietary_restrictions: [],
    disliked_activities: [],
    pace: null,
    plan_integration: null,
  };
}

function parseIsoDateAtMidnight(value: string): number | null {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

export function deriveTripDurationFromDateRange(range: { start: string; end: string }): {
  start: string;
  end: string;
  days: number;
  nights: number;
} | null {
  const start = range.start.trim();
  const end = (range.end || range.start).trim();
  const startTs = parseIsoDateAtMidnight(start);
  const endTs = parseIsoDateAtMidnight(end);
  if (startTs === null || endTs === null || endTs < startTs) {
    return null;
  }
  const days = Math.floor((endTs - startTs) / 86_400_000) + 1;
  return {
    start,
    end,
    days,
    nights: Math.max(0, days - 1),
  };
}

function normalizeTripProfile(profile: TripProfile): TripProfile {
  if (profile.travel_dates) {
    const normalizedRange = deriveTripDurationFromDateRange(profile.travel_dates);
    if (normalizedRange) {
      profile.travel_dates = {
        start: normalizedRange.start,
        end: normalizedRange.end,
      };
      profile.duration_days = normalizedRange.days;
      profile.duration_nights = normalizedRange.nights;
    } else {
      profile.travel_dates = null;
    }
  }
  if (!profile.duration_days && profile.duration_nights !== null && profile.duration_nights >= 0) {
    profile.duration_days = profile.duration_nights + 1;
  }
  if (profile.duration_days && (profile.duration_nights === null || profile.duration_nights < 0)) {
    profile.duration_nights = Math.max(0, profile.duration_days - 1);
  }
  return profile;
}

function mergeTripProfile(base?: TripProfile | null, context?: ChatContext): TripProfile {
  const profile = {
    ...emptyTripProfile(),
    ...(base || {}),
    special_population: {
      ...emptyTripProfile().special_population,
      ...(base?.special_population || {}),
    },
    preferences: [...(base?.preferences || [])],
    visited_before: [...(base?.visited_before || [])],
    avoid_places: [...(base?.avoid_places || [])],
    dietary_restrictions: [...(base?.dietary_restrictions || [])],
    disliked_activities: [...(base?.disliked_activities || [])],
  };
  if (!profile.destination && context?.destination) {
    profile.destination = context.destination;
  }
  if (!profile.duration_days && context?.days) {
    profile.duration_days = context.days;
    profile.duration_nights = Math.max(0, context.days - 1);
  }
  if (!profile.travel_dates && (context?.tripStartDate || context?.tripEndDate)) {
    profile.travel_dates = {
      start: context?.tripStartDate || context?.tripEndDate || "",
      end: context?.tripEndDate || context?.tripStartDate || "",
    };
  }
  if (!profile.budget && context?.budget) {
    profile.budget = String(context.budget);
  }
  if (!profile.pace && context?.preferences?.pace) {
    profile.pace = context.preferences.pace;
  }
  if (!profile.transportation && context?.preferences?.transportPreference) {
    profile.transportation = context.preferences.transportPreference;
  }
  if (profile.preferences.length === 0 && context?.preferences?.interests?.length) {
    profile.preferences = [...context.preferences.interests];
  }
  return normalizeTripProfile(profile);
}

function parseFlexibleNumber(value: string): number | null {
  const digit = value.match(/\d+/)?.[0];
  if (digit) {
    return Number(digit);
  }
  return CHINESE_NUMBERS[value.trim()] ?? null;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function classifyCompanionsFromTravelerCount(travelerCount: number): {
  companions: TripProfile["companions"];
  travelerCount: number;
} {
  if (travelerCount <= 1) {
    return { companions: "solo", travelerCount: 1 };
  }
  if (travelerCount === 2) {
    return { companions: "couple_or_friend", travelerCount: 2 };
  }
  if (travelerCount <= 4) {
    return { companions: "small_group", travelerCount };
  }
  return { companions: "family_group", travelerCount };
}

function formatTwdAmount(value: number): string {
  return `${Math.round(value).toLocaleString("zh-TW")} 元`;
}

function estimateBudgetOptions(profile: TripProfile): Array<{
  label: string;
  value: string;
  recommended?: boolean;
}> {
  const destination = profile.destination || "";
  const days = Math.max(1, profile.duration_days || 3);
  const travelers = Math.max(1, profile.traveler_count || 1);
  const isJapanTrip = /日本|熊本|福岡|東京|大阪|京都|北海道|九州|沖繩|阿蘇|黑川|由布院|別府/u.test(destination);
  const isHighCostJapan = /東京|大阪|京都|北海道|沖繩/u.test(destination);
  const isRegionalJapan = /熊本|福岡|九州|阿蘇|黑川|由布院|別府/u.test(destination);

  let perPersonPerDay = isJapanTrip ? 5_500 : 3_500;
  if (isHighCostJapan) {
    perPersonPerDay += 1_500;
  } else if (isRegionalJapan) {
    perPersonPerDay += 500;
  }
  if (profile.transportation === "self_drive") {
    perPersonPerDay += 1_200;
  } else if (profile.transportation === "charter_or_tour") {
    perPersonPerDay += 1_600;
  }
  if (profile.preferences.includes("onsen")) {
    perPersonPerDay += 800;
  }
  if (profile.preferences.includes("shopping")) {
    perPersonPerDay += 700;
  }
  if (profile.pace === "intensive") {
    perPersonPerDay += 400;
  }
  if (travelers >= 4) {
    perPersonPerDay = Math.max(2_800, perPersonPerDay - 500);
  }

  const leanPerPerson = Math.round(perPersonPerDay * days * 0.85 / 1_000) * 1_000;
  const balancedPerPerson = Math.round(perPersonPerDay * days / 1_000) * 1_000;
  const comfortPerPerson = Math.round(perPersonPerDay * days * 1.35 / 1_000) * 1_000;

  const makeLabel = (tier: string, perPerson: number) => {
    const total = perPerson * travelers;
    const base = travelers > 1
      ? `${tier}：每人約 ${formatTwdAmount(perPerson)}，共約 ${formatTwdAmount(total)}`
      : `${tier}：約 ${formatTwdAmount(total)}`;
    const note =
      tier === "精省"
        ? "以順路景點與平價餐食為主"
        : tier === "平衡"
          ? "景點、交通與餐食配置較平均"
          : "可安排較多特色餐廳或付費體驗";
    return `${base} (${note})`;
  };

  return [
    { label: makeLabel("精省", leanPerPerson), value: String(leanPerPerson * travelers) },
    { label: makeLabel("平衡", balancedPerPerson), value: String(balancedPerPerson * travelers), recommended: true },
    { label: makeLabel("舒適", comfortPerPerson), value: String(comfortPerPerson * travelers) },
  ];
}

function buildPlanFingerprint(days: TripPlanDay[]): string {
  const raw = days
    .map((day) => `D${day.dayNumber}:${day.items.map((item) => `${item.time}-${item.title}`).join("|")}`)
    .join("||");
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function diffDayTitles(day: TripPlanDay): string[] {
  return day.items.map((item) => item.title.trim()).filter(Boolean);
}

function itemRevisionKey(dayNumber: number, item: TripPlanDay["items"][number]): string {
  return `D${dayNumber}:${item.time.trim()}::${item.title.trim()}`;
}

type RevisionComparableItem = {
  day: string;
  time: string;
  title: string;
};

export function buildTravelPlanRevisionMeta(input: {
  previousDays?: TripPlanDay[];
  nextDays: TripPlanDay[];
  profile: TripProfile;
}): TravelPlanRevisionMeta | undefined {
  const previousDays = input.previousDays || [];
  if (!previousDays.length) {
    return undefined;
  }

  const previousItemCount = previousDays.reduce((sum, day) => sum + day.items.length, 0);
  const nextItemCount = input.nextDays.reduce((sum, day) => sum + day.items.length, 0);
  const previousTitles = new Set(previousDays.flatMap(diffDayTitles));
  const nextTitles = new Set(input.nextDays.flatMap(diffDayTitles));
  const addedTitles = [...nextTitles].filter((title) => !previousTitles.has(title)).slice(0, 3);
  const removedTitles = [...previousTitles].filter((title) => !nextTitles.has(title)).slice(0, 3);
  const previousItemMap = new Map(
    previousDays.flatMap((day) =>
      day.items.map((item) => [
        itemRevisionKey(day.dayNumber, item),
        { day: `Day ${day.dayNumber}`, title: item.title.trim(), time: item.time.trim() },
      ] as const),
    ),
  );
  const nextItemMap = new Map(
    input.nextDays.flatMap((day) =>
      day.items.map((item) => [
        itemRevisionKey(day.dayNumber, item),
        { day: `Day ${day.dayNumber}`, title: item.title.trim(), time: item.time.trim() },
      ] as const),
    ),
  );
  const previousByTitle = new Map<string, RevisionComparableItem[]>();
  const nextByTitle = new Map<string, RevisionComparableItem[]>();
  const previousValueToKey = new Map<RevisionComparableItem, string>();
  const nextValueToKey = new Map<RevisionComparableItem, string>();
  for (const [key, value] of previousItemMap.entries()) {
    const titleKey = value.title.toLowerCase();
    previousByTitle.set(titleKey, [...(previousByTitle.get(titleKey) || []), value]);
    previousValueToKey.set(value, key);
  }
  for (const [key, value] of nextItemMap.entries()) {
    const titleKey = value.title.toLowerCase();
    nextByTitle.set(titleKey, [...(nextByTitle.get(titleKey) || []), value]);
    nextValueToKey.set(value, key);
  }
  const movedItems: TravelPlanRevisionMeta["moved_items"] = [];
  const retimedItems: TravelPlanRevisionMeta["retimed_items"] = [];
  const matchedPreviousKeys = new Set<string>();
  const matchedNextKeys = new Set<string>();

  for (const [titleKey, previousEntries] of previousByTitle.entries()) {
    const nextEntries = nextByTitle.get(titleKey);
    if (!nextEntries || previousEntries.length !== 1 || nextEntries.length !== 1) {
      continue;
    }
    const previousEntry = previousEntries[0];
    const nextEntry = nextEntries[0];
    const previousKey = previousValueToKey.get(previousEntry);
    const nextKey = nextValueToKey.get(nextEntry);
    if (!previousKey || !nextKey || previousKey === nextKey) {
      continue;
    }
    if (previousEntry.day !== nextEntry.day) {
      movedItems.push({
        title: nextEntry.title,
        from_day: previousEntry.day,
        to_day: nextEntry.day,
        from_time: previousEntry.time,
        to_time: nextEntry.time,
      });
      matchedPreviousKeys.add(previousKey);
      matchedNextKeys.add(nextKey);
      continue;
    }
    if (previousEntry.time !== nextEntry.time) {
      retimedItems.push({
        day: nextEntry.day,
        title: nextEntry.title,
        from_time: previousEntry.time,
        to_time: nextEntry.time,
      });
      matchedPreviousKeys.add(previousKey);
      matchedNextKeys.add(nextKey);
    }
  }
  const addedItems = [...nextItemMap.entries()]
    .filter(([key]) => !previousItemMap.has(key) && !matchedNextKeys.has(key))
    .map(([, value]) => value)
    .slice(0, 6);
  const removedItems = [...previousItemMap.entries()]
    .filter(([key]) => !nextItemMap.has(key) && !matchedPreviousKeys.has(key))
    .map(([, value]) => value)
    .slice(0, 6);
  const previousDayMap = new Map(previousDays.map((day) => [day.dayNumber, day]));
  const nextDayMap = new Map(input.nextDays.map((day) => [day.dayNumber, day]));
  const changedDays = [...new Set([...previousDayMap.keys(), ...nextDayMap.keys()])]
    .filter((dayNumber) => {
      const previousDay = previousDayMap.get(dayNumber);
      const nextDay = nextDayMap.get(dayNumber);
      if (!previousDay || !nextDay) {
        return true;
      }
      const previousSignature = previousDay.items.map((item) => `${item.time}-${item.title}`).join("|");
      const nextSignature = nextDay.items.map((item) => `${item.time}-${item.title}`).join("|");
      return previousSignature !== nextSignature;
    })
    .map((dayNumber) => `Day ${dayNumber}`);
  const summary: string[] = [];

  if (input.profile.transportation === "self_drive") {
    summary.push("交通偏好已調整為自駕導向。");
  } else if (input.profile.transportation === "public_transport") {
    summary.push("交通偏好已調整為大眾運輸導向。");
  }

  if (input.profile.pace === "relaxed") {
    summary.push("行程節奏已調整為較寬鬆。");
  } else if (input.profile.pace === "intensive") {
    summary.push("行程節奏已調整為較緊湊。");
  }

  if (previousItemCount !== nextItemCount) {
    summary.push(`每日安排總數由 ${previousItemCount} 個調整為 ${nextItemCount} 個。`);
  }
  if (addedTitles.length) {
    summary.push(`新增重點：${addedTitles.join("、")}。`);
  }
  if (removedTitles.length) {
    summary.push(`移除或替換：${removedTitles.join("、")}。`);
  }
  if (!summary.length) {
    summary.push("已依照最新條件微調既有行程結構。");
  }

  return {
    revision_id: `rev_${Date.now().toString(36)}`,
    revised_from: `plan_${buildPlanFingerprint(previousDays)}`,
    based_on_existing_itinerary: true,
    change_summary: summary.slice(0, 4),
    changed_days: changedDays,
    moved_items: movedItems.slice(0, 6),
    retimed_items: retimedItems.slice(0, 6),
    added_items: addedItems,
    removed_items: removedItems,
  };
}

function updateTripProfileFromText(profile: TripProfile, message: string): TripProfile {
  const next = mergeTripProfile(profile);
  const duration = message.match(/([一二兩三四五六七八九十\d]+)\s*天(?:\s*([一二兩三四五六七八九十\d]+)\s*夜)?/u);
  if (duration?.[1]) {
    const days = parseFlexibleNumber(duration[1]);
    if (days) {
      next.duration_days = days;
      next.duration_nights = duration[2] ? parseFlexibleNumber(duration[2]) ?? Math.max(0, days - 1) : Math.max(0, days - 1);
    }
  }

  const destination =
    message.match(/(?:想去|我要去|我想去|去|到)([^，。,\s]+?)(?:玩|旅遊|旅行|自由行|行程|[一二兩三四五六七八九十\d]+\s*天|$)/u)?.[1] ||
    message.match(/^([^，。,\s]{2,12})(?:旅遊|旅行|自由行|行程)/u)?.[1];
  if (destination && !/哪裡|哪邊|幾天|多久/u.test(destination)) {
    next.destination = destination.trim();
  }

  const travelerCountMatch =
    message.match(/(?:總共|一共|共)\s*([一二兩三四五六七八九十\d]+)\s*(?:個人|人)/u) ||
    message.match(/([一二兩三四五六七八九十\d]+)\s*(?:個人|人)(?:同行|一起|出遊|旅遊|旅行|去玩)?/u);
  const explicitTravelerCount = travelerCountMatch?.[1]
    ? parseFlexibleNumber(travelerCountMatch[1])
    : null;
  const hasCoupleSignal = /女朋友|男朋友|老婆|老公|另一半|情侶/u.test(message);
  const hasSoloSignal = /獨旅|自己去|我自己|一個人/u.test(message);
  const hasFamilySignal = /家人|家庭旅遊|爸媽|父母|小孩|孩子|親子/u.test(message);
  if (explicitTravelerCount && explicitTravelerCount > 0) {
    const companionProfile = classifyCompanionsFromTravelerCount(explicitTravelerCount);
    next.companions = hasCoupleSignal && explicitTravelerCount === 2
      ? "couple_or_friend"
      : hasFamilySignal && explicitTravelerCount >= 3
        ? "family_group"
        : companionProfile.companions;
    next.traveler_count = explicitTravelerCount;
  } else if (hasCoupleSignal) {
    next.companions = "couple_or_friend";
    next.traveler_count = 2;
  } else if (hasSoloSignal) {
    next.companions = "solo";
    next.traveler_count = 1;
  }

  if (/自駕|租車/u.test(message)) {
    next.transportation = "self_drive";
  } else if (/大眾運輸|電車|公車|巴士|火車/u.test(message)) {
    next.transportation = "public_transport";
  }

  if (/輕鬆|慢活|不要太累/u.test(message)) {
    next.pace = "relaxed";
  } else if (/扎實|緊湊|排滿|腿軟/u.test(message)) {
    next.pace = "intensive";
  }

  const preferences = [
    /美食|小吃|餐廳/u.test(message) ? "food" : "",
    /自然|風景|阿蘇|山|海|溫泉/u.test(message) ? "nature" : "",
    /逛街|購物|商店街|散步/u.test(message) ? "city_walk" : "",
    /溫泉|放鬆|慢活/u.test(message) ? "onsen" : "",
    /歷史|古蹟|城|神社|寺/u.test(message) ? "history" : "",
  ];
  next.preferences = uniqueStrings([...next.preferences, ...preferences]);
  return applyRevisionInstructionToProfile(next, message);
}

export function applyQuestionAnswers(profile: TripProfile, answers?: ChatQuestionAnswer[]): TripProfile {
  const next = mergeTripProfile(profile);
  for (const answer of answers || []) {
    const values = Array.isArray(answer.value)
      ? answer.value.map(String)
      : answer.value === null || answer.value === undefined
        ? []
        : [String(answer.value)];
    const first = values[0] || "";
    switch (answer.slot) {
      case "companions":
        next.companions = first || null;
        next.traveler_count =
          first === "solo" ? 1 : first === "couple_or_friend" ? 2 : first === "small_group" ? 4 : first ? 5 : next.traveler_count;
        break;
      case "preferences":
        next.preferences = uniqueStrings([...next.preferences, ...values]);
        break;
      case "pace":
        next.pace = first || null;
        break;
      case "plan_integration":
        next.plan_integration = first === "self_merge" ? "self_merge" : "direct_merge";
        break;
      case "departure_location":
        next.departure_location = first.trim() || null;
        break;
      case "destination":
        next.destination = first.trim() || null;
        break;
      case "duration_days": {
        const days = parseFlexibleNumber(first);
        if (days) {
          next.duration_days = days;
          next.duration_nights = next.duration_nights ?? Math.max(0, days - 1);
        }
        break;
      }
      case "duration_nights": {
        const nights = parseFlexibleNumber(first);
        if (nights !== null) {
          next.duration_nights = nights;
        }
        break;
      }
      case "budget":
        next.budget = first || null;
        break;
      case "transportation":
        next.transportation = first || null;
        break;
      case "special_needs":
        next.special_population = {
          has_elderly: values.includes("elderly"),
          has_children: values.includes("children"),
          mobility_issue: values.includes("mobility_issue"),
        };
        if (values.includes("dietary_restriction")) {
          next.dietary_restrictions = uniqueStrings([...next.dietary_restrictions, "需要另行確認飲食限制或過敏"]);
        }
        break;
      case "travel_dates":
        if (answer.value && typeof answer.value === "object" && !Array.isArray(answer.value)) {
          const range = answer.value as { start?: string; end?: string };
          const start = range.start?.trim() || "";
          const end = range.end?.trim() || start;
          next.travel_dates = start || end ? { start, end } : null;
        }
        break;
      default:
        if (answer.slot in next && first) {
          (next as unknown as Record<string, unknown>)[answer.slot] = first;
        }
    }
  }
  return normalizeTripProfile(next);
}

export function buildQuestionCard(
  profile: TripProfile,
  context?: ChatContext,
  options?: { requireConfirmationBeforePlan?: boolean },
): QuestionCardPayload | null {
  const destination = profile.destination || "這次";
  const durationLabel = profile.duration_days ? `${profile.duration_days}天${profile.duration_nights ?? Math.max(0, profile.duration_days - 1)}夜` : "這趟";
  const isJapanTrip = /日本|熊本|福岡|東京|大阪|京都|北海道|九州|沖繩|阿蘇|黑川|由布院|別府/u.test(destination);
  const hasExistingItinerary = Boolean(context?.itinerary?.length);
  const budgetOptions = estimateBudgetOptions(profile);
  const preferenceOptions = uniqueStrings([
    ...(profile.preferences.includes("food") ? ["food"] : []),
    ...(profile.preferences.includes("onsen") || isJapanTrip ? ["onsen"] : []),
    ...(isJapanTrip ? ["nature", "history", "city_walk"] : ["local_culture", "nature", "city_walk"]),
    "shopping",
  ]).map((value) => {
    const labels: Record<string, string> = {
      food: "美食與在地小吃",
      onsen: "溫泉放鬆與慢活",
      nature: isJapanTrip ? "自然風景（阿蘇、山景、海景等）" : "自然風景與戶外景點",
      history: "歷史古蹟與文化景點",
      city_walk: "城市散步與逛街購物",
      local_culture: "在地文化與特色街區",
      shopping: "購物、伴手禮與市集",
    };
    return {
      label: labels[value] || value,
      value,
      recommended: value === "onsen" && isJapanTrip,
    };
  });
  const transportOptions = [
    { label: "大眾運輸", value: "public_transport", recommended: !/阿蘇|九州|北海道|沖繩/u.test(destination) },
    { label: "自駕", value: "self_drive", recommended: /阿蘇|九州|北海道|沖繩/u.test(destination) },
    { label: "包車 / 一日遊行程", value: "charter_or_tour" },
    { label: "還不確定，請 AI 依路線建議", value: "ai_recommend" },
  ];

  if (!profile.destination || !profile.duration_days) {
    return {
      response_type: "question_card",
      title: "先確認行程的基本條件",
      questions: [
        ...(profile.destination
          ? []
          : [{
              slot: "destination" as const,
              question: "你想去哪個目的地？",
              type: "text" as const,
              placeholder: "例如：熊本、福岡、東京",
            }]),
        ...(profile.duration_days
          ? []
          : [{
              slot: "duration_days" as const,
              question: "你預計玩幾天？",
              type: "number" as const,
              placeholder: "例如：5",
            }]),
      ],
      action: { label: "繼續", shortcut: "Enter" },
    };
  }

  const firstRound = [
    !profile.companions
      ? {
          slot: "companions" as const,
          question: `這次${destination}${durationLabel}，你預計是幾個人一起去？`,
          type: "single_choice" as const,
          options: [
            { label: "一個人獨旅", value: "solo", recommended: true },
            { label: "兩個人（情侶 / 朋友）", value: "couple_or_friend" },
            { label: "三到四人小團", value: "small_group" },
            { label: "家庭或四人以上大團", value: "family_group" },
          ],
        }
      : null,
    profile.preferences.length === 0
      ? {
          slot: "preferences" as const,
          question: isJapanTrip
            ? `這次${destination}${durationLabel}，你最想補強哪一類體驗？`
            : `這次${destination}${durationLabel}，你最想優先安排哪一類體驗？`,
          type: "multi_choice" as const,
          options: preferenceOptions,
        }
      : null,
    !profile.pace
      ? {
          slot: "pace" as const,
          question: "你希望每天的行程步調大概是？",
          type: "single_choice" as const,
          options: [
            { label: "輕鬆版：一天 2-3 個點，留很多休息時間", value: "relaxed", recommended: true },
            { label: "普通版：一天 3-4 個點，節奏剛好", value: "normal" },
            { label: "扎實版：一天 4-6 個點，走到腿軟也沒關係", value: "intensive" },
          ],
        }
      : null,
    hasExistingItinerary && !profile.plan_integration
      ? {
          slot: "plan_integration" as const,
          question: "是否直接加入現有行程規劃呢？",
          type: "single_choice" as const,
          options: [
            { label: "直接加入", value: "direct_merge", recommended: true },
            { label: "自行加入", value: "self_merge" },
          ],
        }
      : null,
  ].filter((question): question is NonNullable<typeof question> => Boolean(question));

  if (firstRound.length) {
    return {
      response_type: "question_card",
      title: `先幫我了解你的${destination}旅遊需求，這樣行程會更貼合你`,
      questions: firstRound.slice(0, 4),
      action: { label: "繼續", shortcut: "Enter" },
    };
  }

  const secondRound = [
    !profile.departure_location
      ? {
          slot: "departure_location" as const,
          question: "你會從哪裡出發？",
          type: "text" as const,
          placeholder: "例如：台北、嘉義、高雄、福岡、東京",
        }
      : null,
    !profile.travel_dates
      ? {
          slot: "travel_dates" as const,
          question: `${destination}這趟旅程的出發與返回日期是？`,
          type: "date_range" as const,
        }
      : null,
    !profile.budget
      ? {
          slot: "budget" as const,
          question: `${destination}${durationLabel}的總預算大概抓多少比較合適？`,
          type: "budget" as const,
          placeholder: "也可以直接輸入，例如：每人 28000，或總預算 56000",
          options: budgetOptions,
        }
      : null,
    !profile.transportation
      ? {
          slot: "transportation" as const,
          question: `你在${destination}當地打算怎麼移動？`,
          type: "single_choice" as const,
          options: transportOptions,
        }
      : null,
    {
      slot: "special_needs" as const,
      question: "有沒有特殊需求？",
      type: "multi_choice" as const,
      options: [
        { label: "有長輩同行", value: "elderly" },
        { label: "有小孩同行", value: "children" },
        { label: "行動不便", value: "mobility_issue" },
        { label: "飲食限制 / 過敏", value: "dietary_restriction" },
        { label: "沒有特殊需求", value: "none", recommended: true },
      ],
    },
  ].filter((question): question is NonNullable<typeof question> => Boolean(question));

  if (secondRound.length) {
    return {
      response_type: "question_card",
      title: "再確認幾個行程安排會用到的條件",
      questions: secondRound.slice(0, 4),
      action: { label: "開始規劃", shortcut: "Enter" },
    };
  }

  if (options?.requireConfirmationBeforePlan) {
    return {
      response_type: "question_card",
      title: "開始規劃前，請先確認這些條件",
      questions: [
        {
          slot: "special_needs" as const,
          question: "有沒有特殊需求？",
          type: "multi_choice" as const,
          options: [
            { label: "有長輩同行", value: "elderly" },
            { label: "有小孩同行", value: "children" },
            { label: "行動不便", value: "mobility_issue" },
            { label: "飲食限制 / 過敏", value: "dietary_restriction" },
            { label: "沒有特殊需求", value: "none", recommended: true },
          ],
        },
      ],
      action: { label: "開始規劃", shortcut: "Enter" },
    };
  }

  return null;
}

export function isExistingItineraryInquiry(input: {
  message: string;
  context?: ChatContext;
  questionAnswers?: ChatQuestionAnswer[];
}): boolean {
  if (input.questionAnswers?.length || !input.context?.itinerary?.length) {
    return false;
  }

  const message = input.message.trim();
  const isMutatingRequest =
    /新增|加入|加上|刪除|移除|修改|調整|改成|套用|儲存|建立|創建|產生|重新規劃|幫我(?:安排|規劃|新增|加入|調整|修改)|請(?:安排|規劃|新增|加入|調整|修改)/u.test(message);
  if (isMutatingRequest) {
    return false;
  }

  return /(?:這個|目前|現在|我的)?行程(?:裡面|裡|內)?(?:有(?:哪些|什麼|甚麼)|包含|內容|活動|景點|地點|安排)|有(?:哪些|什麼|甚麼)(?:活動|景點|地點|安排)|第[一二兩三四五六七八九十\d]+天(?:有(?:哪些|什麼|甚麼)|安排|活動|景點|地點)|列出(?:這個|目前|我的)?行程/u.test(message);
}

function isVideoInspirationRequest(message: string): boolean {
  return /影片|youtube|YouTube|vlog|靈感|參考影片|旅遊影片|看影片/u.test(message);
}

function parseRequestedDayNumber(message: string): number | null {
  const digitMatch = message.match(/第\s*(\d+)\s*天/u);
  if (digitMatch?.[1]) {
    return Number(digitMatch[1]);
  }
  const chineseMatch = message.match(/第\s*([一二兩三四五六七八九十])\s*天/u);
  if (chineseMatch?.[1]) {
    return CHINESE_NUMBERS[chineseMatch[1]] ?? null;
  }
  return null;
}

function buildExistingItineraryInquiryResponse(input: {
  message: string;
  context?: ChatContext;
  questionAnswers?: ChatQuestionAnswer[];
}): ChatResponsePayload | null {
  if (!isExistingItineraryInquiry(input)) {
    return null;
  }

  const itinerary = input.context?.itinerary || [];
  if (!itinerary.length) {
    return null;
  }

  const requestedDay = parseRequestedDayNumber(input.message);
  const days = requestedDay
    ? itinerary.filter((day) => day.dayNumber === requestedDay)
    : itinerary;
  if (!days.length) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `目前行程中沒有找到第 ${requestedDay} 天的內容。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  const asksForPlaces = /地點|景點|去哪|哪裡|location|place/i.test(input.message);
  const lines = days.flatMap((day) =>
    day.items.map((item) => {
      const locationName = item.location?.name?.trim();
      const address = item.location?.address?.trim();
      const displayName = asksForPlaces && locationName ? locationName : item.title;
      const addressText = address ? `（${address}）` : "";
      return `- Day ${day.dayNumber} ${item.time}：${displayName}${addressText}`;
    }),
  );

  const destination = input.context?.destination ? `${input.context.destination} ` : "";
  const title = requestedDay
    ? `${destination}第 ${requestedDay} 天目前有這些${asksForPlaces ? "地點" : "安排"}：`
    : `${destination}目前行程有這些${asksForPlaces ? "地點" : "安排"}：`;

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `${title}\n${lines.join("\n")}`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
    },
  };
}

function hasTripPlanningIntent(message: string): boolean {
  return /(?:幫我|請|可以|能不能|想要|我要|我想|需要).{0,12}(?:規劃|安排|建立|創建|產生|生成|做一份|排|新增|加入|加上|修改|調整|重排|重新規劃)|(?:規劃|安排|建立|產生|生成|新增|加入|修改|調整|重排|重新規劃).{0,12}(?:行程|旅行|旅遊|景點|活動|餐廳|美食)|(?:想去|我要去|我想去).{0,30}(?:玩|旅遊|旅行|自由行|[一二兩三四五六七八九十\d]+\s*天)|(?:玩|排)[一二兩三四五六七八九十\d]+\s*天|[一二兩三四五六七八九十\d]+\s*天[一二兩三四五六七八九十\d]*\s*夜(?:行程|旅行|旅遊|自由行)?/u.test(message);
}

function isExistingItineraryPatchRequest(input: {
  message: string;
  context?: ChatContext;
}): boolean {
  if (!input.context?.itinerary?.length) {
    return false;
  }
  const message = input.message.trim();
  const mutatesCurrentItinerary = /新增|加入|加上|刪除|移除|修改|調整|改成|換成|改到|提前|延後|移到/u.test(message);
  if (!mutatesCurrentItinerary) {
    return false;
  }
  return !/重新規劃|重排|整份|整個|全部|從頭|完整(?:安排|規劃)|(?:規劃|安排).{0,8}(?:新|完整|整份|全部)?行程/u.test(message);
}

function compactComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function cleanupPatchTitle(value: string | undefined): string {
  return (value || "")
    .replace(/^[「『"'\s]+|[」』"'\s]+$/gu, "")
    .replace(/(?:其他|其餘)安排.*$/u, "")
    .replace(/先維持不變.*$/u, "")
    .replace(/即可.*$/u, "")
    .trim();
}

function matchItineraryItemFromContext(input: {
  context?: ChatContext;
  day?: number | null;
  title: string;
}) {
  const title = compactComparableText(input.title);
  if (!title || !input.context?.itinerary?.length) {
    return null;
  }
  const scopedDays = input.day
    ? input.context.itinerary.filter((day) => day.dayNumber === input.day)
    : input.context.itinerary;
  for (const day of scopedDays) {
    const item = day.items.find((candidate) => {
      const candidateTitle = compactComparableText(candidate.title);
      const candidateLocation = compactComparableText(candidate.location?.name || "");
      return (
        candidateTitle.includes(title) ||
        title.includes(candidateTitle) ||
        Boolean(candidateLocation && (candidateLocation.includes(title) || title.includes(candidateLocation)))
      );
    });
    if (item) {
      return {
        dayNumber: day.dayNumber,
        item,
      };
    }
  }
  return null;
}

function parsePatchDayNumber(raw: string | undefined): number | null {
  if (!raw) {
    return null;
  }
  const trimmed = raw.trim();
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return CHINESE_NUMBERS[trimmed] ?? null;
}

function buildDeterministicItineraryPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  if (!input.context?.itinerary?.length) {
    return null;
  }

  const message = input.message.trim();
  const replaceMatch =
    message.match(
      /(?:把)?第\s*(\d+|[一二兩三四五六七八九十])\s*天(?:的)?\s*([^\n，。,]+?)\s*(?:改成|換成|替換成|改為|換為)\s*([^\n，。,]+?)(?:$|[，。,])/u,
    ) ||
    message.match(
      /(?:把)?\s*([^\n，。,]+?)\s*(?:改成|換成|替換成|改為|換為)\s*([^\n，。,]+?)(?:$|[，。,])/u,
    );

  if (replaceMatch) {
    const hasExplicitDay = replaceMatch.length >= 4;
    const day = hasExplicitDay ? parsePatchDayNumber(replaceMatch[1]) : null;
    const originalTitle = cleanupPatchTitle(hasExplicitDay ? replaceMatch[2] : replaceMatch[1]);
    const nextTitle = cleanupPatchTitle(hasExplicitDay ? replaceMatch[3] : replaceMatch[2]);
    if (!originalTitle || !nextTitle) {
      return null;
    }
    const target = matchItineraryItemFromContext({
      context: input.context,
      day,
      title: originalTitle,
    });
    if (!target) {
      return null;
    }
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `已將第 ${target.dayNumber} 天的「${target.item.title}」調整為「${nextTitle}」，其餘安排維持不變。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
        proposedChanges: [
          {
            type: "update_itinerary_item",
            day: target.dayNumber,
            itemId: target.item.id,
            targetTitle: target.item.title,
            title: nextTitle,
            locationName: nextTitle,
            reason: `依照使用者要求，將 ${originalTitle} 替換為 ${nextTitle}`,
            source: "ai-chat",
          },
        ],
      },
      proposedChanges: [
        {
          type: "update_itinerary_item",
          day: target.dayNumber,
          itemId: target.item.id,
          targetTitle: target.item.title,
          title: nextTitle,
          locationName: nextTitle,
          reason: `依照使用者要求，將 ${originalTitle} 替換為 ${nextTitle}`,
          source: "ai-chat",
        },
      ],
    };
  }

  const removeMatch = message.match(
    /(?:刪除|移除)\s*(?:第\s*(\d+|[一二兩三四五六七八九十])\s*天(?:的)?)?\s*([^\n，。,]+?)(?:$|[，。,])/u,
  );
  if (removeMatch) {
    const day = parsePatchDayNumber(removeMatch[1]);
    const targetTitle = cleanupPatchTitle(removeMatch[2]);
    const target = matchItineraryItemFromContext({
      context: input.context,
      day,
      title: targetTitle,
    });
    if (!target) {
      return null;
    }
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `已從第 ${target.dayNumber} 天移除「${target.item.title}」。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
        proposedChanges: [
          {
            type: "remove_itinerary_item",
            day: target.dayNumber,
            itemId: target.item.id,
            targetTitle: target.item.title,
            reason: `依照使用者要求移除此行程項目`,
            source: "ai-chat",
          },
        ],
      },
      proposedChanges: [
        {
          type: "remove_itinerary_item",
          day: target.dayNumber,
          itemId: target.item.id,
          targetTitle: target.item.title,
          reason: `依照使用者要求移除此行程項目`,
          source: "ai-chat",
        },
      ],
    };
  }

  const addMatch = message.match(
    /(?:在)?第\s*(\d+|[一二兩三四五六七八九十])\s*天(?:.*?)(?:加入|加上|新增)\s*([^\n，。,]+?)(?:$|[，。,])/u,
  );
  if (addMatch) {
    const day = parsePatchDayNumber(addMatch[1]);
    const title = cleanupPatchTitle(addMatch[2]);
    if (!day || !title) {
      return null;
    }
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `已將「${title}」加入第 ${day} 天行程。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
        proposedChanges: [
          {
            type: "add_itinerary_item",
            day,
            time: "18:30",
            title,
            locationName: title,
            reason: "依照使用者要求新增行程項目",
            source: "ai-chat",
          },
        ],
      },
      proposedChanges: [
        {
          type: "add_itinerary_item",
          day,
          time: "18:30",
          title,
          locationName: title,
          reason: "依照使用者要求新增行程項目",
          source: "ai-chat",
        },
      ],
    };
  }

  return null;
}

export function needsTravelResearch(input: {
  message: string;
  context?: ChatContext;
}): boolean {
  const message = input.message.trim();
  if (!message || !input.context?.destination) {
    return false;
  }
  if (isExistingItineraryInquiry(input) || isExistingItineraryPatchRequest(input)) {
    return false;
  }
  if (isVideoInspirationRequest(message)) {
    return true;
  }
  return /推薦|景點|美食|餐廳|咖啡|晚上|夜景|夜市|適合|附近|天氣|降雨|氣溫|營業時間|開到幾點|門票|交通|怎麼去|封路|活動|市集|祭典|今年|近期|最新/u.test(message);
}

export function isTripWorkflowMessage(input: {
  message: string;
  context?: ChatContext;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
}): boolean {
  if (isExistingItineraryInquiry(input)) {
    return false;
  }
  if (isExistingItineraryPatchRequest(input)) {
    return false;
  }

  return Boolean(
    input.questionAnswers?.length ||
      hasTripPlanningIntent(input.message) ||
      (input.tripProfile && hasTripPlanningIntent(input.message)),
  );
}

function budgetToNumber(value?: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  if (value === "budget") {
    return 30_000;
  }
  if (value === "mid_range") {
    return 50_000;
  }
  if (value === "comfortable") {
    return 80_000;
  }
  const digits = value.match(/\d+/g);
  if (!digits?.length) {
    return undefined;
  }
  return Number(digits.join(""));
}

function truncateAlertSnippet(text: string, maxLength = 88): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function toUserFacingTransportLabel(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return value;
  }
  if (normalized === "public_transport") {
    return "大眾運輸";
  }
  if (normalized === "self_drive") {
    return "自駕";
  }
  if (normalized === "charter_or_tour") {
    return "包車 / 一日遊";
  }
  if (normalized === "ai_recommend") {
    return "依路線由 AI 建議交通方式";
  }
  return value;
}

function hasTemplatePollutionWarning(warnings?: string[]): boolean {
  return (warnings || []).some((warning) => /^QUALITY:TEMPLATE_POLLUTION:/i.test(warning));
}

function buildWeatherAlertsFromSources(
  profile: TripProfile,
  sources: Record<string, ChatSource>,
): TravelPlanResponse["weather_alerts"] {
  const weatherSources = Object.values(sources).filter((source) => source.type === "weather");
  if (!weatherSources.length) {
    return profile.travel_dates
      ? [{
          day: "全程",
          message: "出發前請再次確認逐日降雨與天氣變化，戶外景點可保留備案。",
        }]
      : [{
          day: "全程",
          message: "尚未提供實際旅遊日期，因此天氣只能作為提醒方向；出發前需再查即時預報。",
        }];
  }

  const alerts = weatherSources
    .slice(0, 3)
    .map((source) => {
      const dateMatch = `${source.title} ${source.snippet}`.match(/\d{4}-\d{2}-\d{2}/);
      const precipMatch = source.snippet.match(/(\d{1,3})%/);
      const precip = precipMatch ? Number(precipMatch[1]) : null;
      const prefix = dateMatch ? `${dateMatch[0]}` : "全程";
      const message = precip !== null && precip >= 50
        ? `${prefix} 降雨機率偏高，建議把戶外景點改成可替代的室內或彈性行程。`
        : `${prefix} 天氣摘要：${truncateAlertSnippet(source.snippet || source.preview_text)}`;
      return {
        day: dateMatch ? dateMatch[0] : "全程",
        message,
        citations: [source.source_id],
      };
    });

  return alerts.length ? alerts : [{
    day: "全程",
    message: "出發前請再次確認逐日降雨與天氣變化，戶外景點可保留備案。",
  }];
}

function buildEventAlertsFromSources(sources: Record<string, ChatSource>): TravelPlanResponse["event_alerts"] {
  const officialSources = Object.values(sources).filter((source) => source.type === "official");
  const keywordPattern = /活動|祭|展|市集|公告|封路|交通管制|休館|停駛|改道|festival|closure|event/i;

  return officialSources
    .filter((source) => keywordPattern.test(`${source.title} ${source.snippet} ${source.preview_text}`))
    .slice(0, 3)
    .map((source) => {
      const dateMatch = `${source.title} ${source.snippet}`.match(/\d{4}-\d{2}-\d{2}/);
      const snippet = truncateAlertSnippet(source.snippet || source.preview_text || source.title);
      return {
        day: dateMatch ? dateMatch[0] : "全程",
        message: `官方提醒：${snippet}`,
        citations: [source.source_id],
      };
    });
}

function toUserFacingPlanWarnings(warnings?: string[]): string[] {
  return uniqueStrings(
    (warnings || []).filter((warning) =>
      Boolean(warning) &&
      !/^QUALITY:/i.test(warning) &&
      !/AI 模型輸出格式異常|fallback itinerary|無法連線到搜尋服務/i.test(warning),
    ),
  );
}

function profileToTripPlanRequest(profile: TripProfile, context?: ChatContext): TripPlanRequest {
  const pace = profile.pace === "relaxed" || profile.pace === "intensive" ? profile.pace : "moderate";
  return {
    destination: profile.destination || "未指定目的地",
    days: Math.max(1, profile.duration_days || 3),
    budget: budgetToNumber(profile.budget),
    tripStartDate: profile.travel_dates?.start || context?.tripStartDate || undefined,
    tripEndDate: profile.travel_dates?.end || profile.travel_dates?.start || context?.tripEndDate || context?.tripStartDate || undefined,
    preferences: {
      interests: profile.preferences.length ? profile.preferences : ["景點", "美食"],
      pace,
      transportPreference: profile.transportation || "ai_recommend",
      budget: budgetToNumber(profile.budget),
      notes: [
        profile.departure_location ? `出發地：${profile.departure_location}` : "",
        profile.companions ? `同行者：${profile.companions}` : "",
        profile.plan_integration === "direct_merge" ? "新行程將直接併入既有規劃。" : "",
        profile.plan_integration === "self_merge" ? "新行程僅提供建議，由使用者自行加入既有規劃。" : "",
        profile.special_population.has_elderly ? "有長輩同行" : "",
        profile.special_population.has_children ? "有小孩同行" : "",
        profile.special_population.mobility_issue ? "有行動不便需求" : "",
        profile.dietary_restrictions.length ? `飲食限制：${profile.dietary_restrictions.join("、")}` : "",
      ].filter(Boolean).join("；"),
      avoid: profile.avoid_places,
      mustVisit: profile.visited_before.length ? undefined : [],
    },
    itineraryDraft: context?.itinerary,
  };
}

export function convertTripPlanToTravelPlanWithSources(
  plan: TripPlanResult,
  profile: TripProfile,
  sources: Record<string, ChatSource>,
  revision?: TravelPlanRevisionMeta,
): TravelPlanResponse {
  const title = `${profile.destination || "旅遊"}${profile.duration_days || plan.days.length}天${profile.duration_nights ?? Math.max(0, (profile.duration_days || plan.days.length) - 1)}夜行程規劃`;
  const cite = (
    text: string,
    preference?: {
      preferredTypes?: ChatSource["type"][];
      preferredProviders?: string[];
    },
  ): string[] | undefined => {
    const citations = pickCitationIdsForText(text, sources, 2, preference);
    return citations.length > 0 ? citations : undefined;
  };
  const citeText = (
    text: string,
    preference?: {
      preferredTypes?: ChatSource["type"][];
      preferredProviders?: string[];
    },
  ): CitationText => ({
    text,
    citations: cite(text, preference),
  });
  const weatherAlerts = buildWeatherAlertsFromSources(profile, sources);
  const eventAlerts = buildEventAlertsFromSources(sources);
  const userFacingWarnings = toUserFacingPlanWarnings(plan.warnings);
  const assumptionTexts = uniqueStrings([
    profile.travel_dates ? "" : "使用者尚未提供實際旅遊日期，因此活動與天氣不是即時保證。",
    profile.transportation === "self_drive" ? "交通以自駕邏輯安排。" : "交通以大眾運輸或 AI 建議為主要假設。",
    ...userFacingWarnings,
  ]);
  return {
    response_type: "travel_plan",
    title,
    revision,
    sources: Object.keys(sources).length ? sources : undefined,
    summary_table: plan.days.map((day) => ({
      day: `Day ${day.dayNumber}`,
      main_route: day.items.map((item) => item.title).join(" -> "),
      citations: cite(day.items.map((item) => `${item.title} ${item.notes || ""}`).join(" "), {
        preferredTypes: ["official", "web", "weather"],
      }),
    })),
    days: plan.days.map((day) => {
      const foodItems = day.items.filter((item) => item.type === "restaurant");
      const spotItems = day.items.filter((item) => item.type !== "restaurant");
      return {
        day: `Day ${day.dayNumber}`,
        theme: day.theme || day.summary || `第 ${day.dayNumber} 天`,
        citations: cite(`${day.theme || ""} ${day.summary || ""}`.trim(), {
          preferredTypes: ["official", "web", "weather"],
        }),
        transportation: uniqueStrings(day.items.map((item) => item.transport || "").filter(Boolean))
          .slice(0, 4)
          .map((text) => citeText(toUserFacingTransportLabel(text), { preferredTypes: ["official", "web"] })),
        spots: spotItems.map((item) => ({
          name: item.title,
          feature: item.notes || item.sourceSnippet || "依照目前旅遊需求安排的停靠點",
          citations: cite(`${item.title} ${item.notes || item.sourceSnippet || ""}`, { preferredTypes: ["official", "web", "youtube"] }),
        })),
        food_recommendations: foodItems.map((item) => ({
          name: item.title,
          description: item.notes || item.sourceSnippet || "依照目前旅遊需求安排的用餐建議",
          citations: cite(`${item.title} ${item.notes || item.sourceSnippet || ""}`, { preferredTypes: ["web", "youtube"] }),
        })),
        tips: uniqueStrings([day.summary || "", ...day.items.map((item) => item.notes || "")])
          .slice(0, 3)
          .map((text) => citeText(text, { preferredTypes: ["official", "weather", "web"] })),
      };
    }),
    weather_alerts: weatherAlerts.map((alert) => ({
      ...alert,
      citations: alert.citations || cite(alert.message, { preferredTypes: ["weather"] }),
    })),
    event_alerts: eventAlerts.map((alert) => ({
      ...alert,
      citations: alert.citations || cite(alert.message, { preferredTypes: ["official"] }),
    })),
    assumptions: assumptionTexts.map((text) => citeText(text, { preferredTypes: ["official", "weather", "web"] })),
  };
}

function buildPlanningStatusSteps(): StatusStepPayload[] {
  return [
    { type: "status_step", phase: "understand", label: "理解旅遊需求", status: "completed" },
    { type: "status_step", phase: "plan", label: "規劃查詢範圍", status: "completed" },
    { type: "status_step", phase: "research", label: "查詢景點、交通與天氣", status: "completed" },
    { type: "status_step", phase: "compose", label: "生成完整行程", status: "completed" },
  ];
}

function buildWaitingForInputStatusSteps(): StatusStepPayload[] {
  return [
    { type: "status_step", phase: "understand", label: "理解旅遊需求", status: "completed" },
    {
      type: "status_step",
      phase: "waiting_user",
      label: "等待補充旅遊條件",
      detail: "收到回答後會開始查詢景點、交通與天氣。",
      status: "waiting_input",
    },
    { type: "status_step", phase: "research", label: "查詢景點、交通與天氣", status: "pending" },
    { type: "status_step", phase: "compose", label: "生成完整行程", status: "pending" },
  ];
}

async function handleStructuredTripWorkflow(input: {
  message: string;
  context?: ChatContext;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
  progressSessionId?: string;
  memoryContext?: string;
  forceStructuredRevision?: boolean;
}): Promise<ChatResponsePayload | null> {
  if (!input.forceStructuredRevision && !isTripWorkflowMessage(input)) {
    return null;
  }

  const seeded = mergeTripProfile(input.tripProfile, input.context);
  const withText = updateTripProfileFromText(seeded, input.message);
  const profile = applyQuestionAnswers(withText, input.questionAnswers);
  if (input.forceStructuredRevision && input.context?.itinerary?.length) {
    profile.plan_integration = "direct_merge";
  }

  const needsUserIntake = !input.questionAnswers?.length;
  const card = buildQuestionCard(profile, input.context, {
    requireConfirmationBeforePlan: needsUserIntake,
  });

  if (card && needsUserIntake) {
    publishProgressStep(input.progressSessionId, {
      phase: "waiting_user",
      label: "等待補充旅遊條件",
      detail: "請先回答幾個問題，系統才會開始查資料與排行程。",
      status: "waiting_input",
    });
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: card.title,
        timestamp: nowChatTimestamp(),
        responseType: "question_card",
        statusSteps: buildWaitingForInputStatusSteps(),
        questionCard: card,
        tripProfile: profile,
      },
      tripProfile: profile,
    };
  }

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "理解旅遊需求",
    detail: "正在整理目的地、天數、旅伴與偏好條件。",
    status: "running",
  });
  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "理解旅遊需求",
    detail: "已整理目前已知的旅遊條件。",
    status: "completed",
  });

  publishProgressStep(input.progressSessionId, {
    phase: "plan",
    label: "規劃查詢範圍",
    detail: "判斷是否需要查詢天氣、景點、活動與交通資料。",
    status: "running",
  });
  const request = profileToTripPlanRequest(profile, input.context);
  publishProgressStep(input.progressSessionId, {
    phase: "plan",
    label: "規劃查詢範圍",
    detail: "已決定查詢範圍，準備開始蒐集外部資料。",
    status: "completed",
  });
  const generated = await generateTripPlan(request, input.memoryContext, input.progressSessionId);
  const webSources = normalizeWebSearchSources(await runWebSearch(
    [profile.destination || "", profile.preferences.join(" "), "行程 交通 美食"].filter(Boolean).join(" ").trim(),
    4,
  ).then((bundle) => bundle.results));
  const sourceDictionary = mergeChatSources(generated.sources, webSources);
  if (Object.keys(sourceDictionary).length > 0) {
    registerChatSources(sourceDictionary);
  }
  publishProgressStep(input.progressSessionId, {
    phase: "compose",
    label: "生成完整行程",
    detail: "正在整理總覽、每日路線與提醒資訊。",
    status: "running",
    provider: "ollama",
  });
  const travelPlan = convertTripPlanToTravelPlanWithSources(
    generated.plan,
    profile,
    sourceDictionary,
    buildTravelPlanRevisionMeta({
      previousDays: input.context?.itinerary,
      nextDays: generated.plan.days,
      profile,
    }),
  );
  publishProgressStep(input.progressSessionId, {
    phase: "compose",
    label: "生成完整行程",
    detail: "最終行程已完成。",
    status: "completed",
    provider: "ollama",
  });
  const statusSteps = buildPlanningStatusSteps();
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: travelPlan.title,
      timestamp: nowChatTimestamp(),
      responseType: "travel_plan",
      statusSteps,
      travelPlan,
      tripProfile: profile,
    },
    itinerarySuggestion: generated.plan,
    tripProfile: profile,
  };
}

async function runWebSearch(
  query: string,
  limit?: number,
  progressSessionId?: string,
): Promise<WebSearchBundle> {
  if (!serverConfig.aiWebSearchEnabled || !serverConfig.searxngEnabled || !shouldUseWebSearch(query)) {
    return { results: [], digest: "" };
  }

  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢一般網頁資料",
    detail: `正在查詢：${query}`,
    status: "running",
    provider: "searxng",
    query,
  });
  const results = await searchWeb({
    query,
    limit: Math.min(serverConfig.aiWebSearchMaxResults, limit ?? serverConfig.aiWebSearchMaxResults),
  });
  if (!results.length) {
    publishProgressStep(progressSessionId, {
      phase: "research",
      label: "查詢一般網頁資料",
      detail: "未取得可用結果，將改以既有資料繼續整理。",
      status: "failed",
      provider: "searxng",
      query,
    });
    return {
      results: [],
      digest: "",
      warning: "目前無法連線到搜尋服務，因此以下內容可能不是最新資料。",
    };
  }
  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢一般網頁資料",
    detail: `已取得 ${results.length} 筆網頁結果。`,
    status: "completed",
    provider: "searxng",
    query,
  });
  return {
    results,
    digest: formatWebSearchDigest(results),
  };
}

function enrichPlanWithSearchSources(
  plan: TripPlanResult,
  searchResults: WebSearchResult[],
  warning?: string,
): TripPlanResult {
  void warning;
  if (!searchResults.length) {
    return plan;
  }

  const nextDays = plan.days.map((day) => ({
    ...day,
    items: day.items.map((item) => {
      if (item.sourceUrl) {
        return item;
      }
      const normalizedTitle = item.title.trim().toLowerCase();
      const match = searchResults.find((result) => {
        const haystack = `${result.title} ${result.content}`.toLowerCase();
        return normalizedTitle.length >= 2 && haystack.includes(normalizedTitle);
      });
      if (!match) {
        return item;
      }
      return {
        ...item,
        sourceTitle: match.title,
        sourceUrl: match.url,
        sourceSnippet: match.content,
        confidence: (match.score && match.score >= 0.75 ? "high" : "medium") as
          | "high"
          | "medium",
      };
    }),
  }));

  return {
    ...plan,
    days: nextDays,
  };
}

async function buildExistingItineraryPatchResponse(input: {
  message: string;
  messages?: ChatMessage[];
  context?: ChatContext;
  memoryContext?: string;
  progressSessionId?: string;
}): Promise<ChatResponsePayload | null> {
  if (!isExistingItineraryPatchRequest(input)) {
    return null;
  }

  const deterministicPatch = buildDeterministicItineraryPatchResponse({
    message: input.message,
    context: input.context,
  });
  if (deterministicPatch) {
    return deterministicPatch;
  }

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "分析目前行程修改需求",
    detail: "正在比對既有行程與新的修改指令。",
    status: "running",
  });
  const prompt = buildChatPrompt(
    input.message,
    input.context,
    input.memoryContext,
    "這是既有行程修改任務。請根據目前 itinerary context 產生 proposedChanges。除非使用者只是詢問，否則不要產生全新行程；也不要要求外部 research。",
    undefined,
  );
  const raw = await chatWithOllama({
    task: "travel-chat",
    format: "json",
    messages: [
      { role: "system", content: prompt.system },
      ...normalizeHistory(input.context, detectResponseLanguage(input.message)),
      ...normalizeConversationHistory(input.messages),
      { role: "user", content: prompt.user },
    ],
  });
  const structured = parseStructuredChatOutput(raw);
  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "分析目前行程修改需求",
    detail: "已完成修改需求分析。",
    status: "completed",
  });

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: structured.replyText,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      proposedChanges: structured.proposedChanges,
    },
    proposedChanges: structured.proposedChanges,
  };
}

function dedupePlaceHitsByName(placeHits: PlaceSearchHit[]): PlaceSearchHit[] {
  const seen = new Set<string>();
  return placeHits.filter((place) => {
    const key = place.name.trim().toLowerCase();
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function isRestaurantLikePlace(place: PlaceSearchHit): boolean {
  return place.types.some((type) => /restaurant|food|cafe|bakery|meal_takeaway|bar/i.test(type));
}

function createSyntheticFallbackStops(destination: string, chinese: boolean): PlaceSearchHit[] {
  const names = chinese
    ? [
        `${destination}老城區散步`,
        `${destination}河岸散策`,
        `${destination}文創街區`,
        `${destination}在地市場`,
        `${destination}夜景收尾`,
      ]
    : [
        `${destination} old town walk`,
        `${destination} riverside stroll`,
        `${destination} creative district`,
        `${destination} local market`,
        `${destination} evening viewpoint`,
      ];
  return names.map((name, index) => ({
    name,
    formattedAddress: "",
    lat: 0,
    lng: 0,
    placeId: `synthetic_fallback_${index + 1}`,
    types: ["point_of_interest"],
  }));
}

function buildSyntheticMealStop(anchorName: string, chinese: boolean, slot: "lunch" | "dinner"): PlaceSearchHit {
  const name = chinese
    ? slot === "lunch"
      ? `${anchorName} 周邊午餐`
      : `${anchorName} 晚餐與散步`
    : slot === "lunch"
      ? `${anchorName} lunch stop`
      : `${anchorName} dinner and walk`;
  return {
    name,
    formattedAddress: "",
    lat: 0,
    lng: 0,
    placeId: `synthetic_${slot}_${anchorName.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/gi, "_")}`,
    types: ["restaurant"],
  };
}

function pickUniquePlaces(
  pool: PlaceSearchHit[],
  startIndex: number,
  targetCount: number,
): PlaceSearchHit[] {
  if (!pool.length || targetCount <= 0) {
    return [];
  }
  const picks: PlaceSearchHit[] = [];
  const seen = new Set<string>();
  let cursor = startIndex;
  while (picks.length < targetCount && cursor < startIndex + pool.length * 2) {
    const candidate = pool[cursor % pool.length];
    const key = candidate.name.trim().toLowerCase();
    if (key && !seen.has(key)) {
      picks.push(candidate);
      seen.add(key);
    }
    cursor += 1;
  }
  return picks;
}

function buildFallbackTripPlan(request: TripPlanRequest, placeHits: PlaceSearchHit[] = []): TripPlanResult {
  const chinese = isCjk(
    [request.destination, request.preferences.notes, request.preferences.interests.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const transportLabel = request.preferences.transportPreference || (chinese ? "大眾運輸" : "Public transit");
  const summary = chinese
    ? `${request.destination} ${request.days} 天基礎行程已建立，可再依需求微調。`
    : `Created a ${request.days}-day starter itinerary for ${request.destination}.`;
  const mustVisit = request.preferences.mustVisit || [];
  const normalizedMustVisit = new Set(mustVisit.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const validPlaces = dedupePlaceHitsByName(placeHits.filter((place) => place.name.trim().length > 1));
  const restaurants = validPlaces.filter(isRestaurantLikePlace);
  const attractions = validPlaces.filter((place) => !isRestaurantLikePlace(place));
  const preferredStops = dedupePlaceHitsByName([
    ...validPlaces.filter((place) => normalizedMustVisit.has(place.name.trim().toLowerCase())),
    ...attractions,
  ]);
  const fallbackStops = dedupePlaceHitsByName([
    ...preferredStops,
    ...createSyntheticFallbackStops(request.destination, chinese),
  ]);
  const fallbackMeals = restaurants.length ? dedupePlaceHitsByName(restaurants) : [];

  const toLocation = (place: PlaceSearchHit | undefined, description: string) =>
    place && Number.isFinite(place.lat) && Number.isFinite(place.lng) && Math.abs(place.lat) <= 90 && Math.abs(place.lng) <= 180
      ? {
          name: place.name,
          lat: place.lat,
          lng: place.lng,
          description,
          address: place.formattedAddress || undefined,
        }
      : undefined;

  const days: TripPlanDay[] = Array.from({ length: request.days }, (_, index) => {
    const dayNumber = index + 1;
    const dayStops = pickUniquePlaces(
      fallbackStops,
      index * 2,
      Math.min(3, Math.max(2, fallbackStops.length >= request.days * 2 ? 3 : 2)),
    );
    const morning = dayStops[0] || fallbackStops[0];
    const afternoon = dayStops[1] || dayStops[0] || fallbackStops[0];
    const eveningAnchor = dayStops[2] || afternoon || morning;
    const lunch = fallbackMeals[index % fallbackMeals.length] || buildSyntheticMealStop(morning.name, chinese, "lunch");
    const dinner = fallbackMeals[(index + 1) % fallbackMeals.length] || buildSyntheticMealStop(eveningAnchor.name, chinese, "dinner");
    const dayTheme = chinese
      ? `${uniqueStrings([morning.name, afternoon.name]).join("・")} 順遊`
      : `${morning.name} and ${afternoon.name} route`;

    return {
      dayNumber,
      theme: dayTheme,
      summary: chinese
        ? `第 ${dayNumber} 天以 ${morning.name}、${afternoon.name} 和沿線餐食安排為主，保留午晚餐與散步節奏。`
        : `Day ${dayNumber} focuses on ${morning.name}, ${afternoon.name}, and nearby meal stops.`,
      items: [
        {
          id: `fallback_${dayNumber}_1`,
          dayNumber,
          time: "09:00",
          title: morning.name,
          type: "attraction",
          transport: transportLabel,
          notes: chinese
            ? `上午先從 ${morning.name} 開始，方便銜接後續動線。`
            : `Start the morning at ${morning.name} for a coherent route.`,
          source: "ai",
          location: toLocation(morning, `${request.destination} 建議上午停留點`),
        },
        {
          id: `fallback_${dayNumber}_2`,
          dayNumber,
          time: "12:00",
          title: lunch.name,
          type: "restaurant",
          transport: transportLabel,
          notes: chinese
            ? `中午安排在 ${lunch.name} 附近用餐，保留休息時間。`
            : `Lunch near ${lunch.name} with a short rest buffer.`,
          source: "ai",
          location: toLocation(lunch, `${request.destination} 建議午餐停留點`),
        },
        {
          id: `fallback_${dayNumber}_3`,
          dayNumber,
          time: "15:00",
          title: afternoon.name,
          type: "activity",
          transport: transportLabel,
          notes: chinese
            ? `下午接續 ${afternoon.name}，讓景點分布維持在同一條路線上。`
            : `Continue to ${afternoon.name} in the afternoon to keep the route compact.`,
          source: "ai",
          location: toLocation(afternoon, `${request.destination} 建議下午停留點`),
        },
        {
          id: `fallback_${dayNumber}_4`,
          dayNumber,
          time: "18:30",
          title: dinner.name,
          type: /夜景|viewpoint|stroll/i.test(dinner.name) ? "activity" : "restaurant",
          transport: transportLabel,
          notes: chinese
            ? `晚餐與收尾安排放在 ${dinner.name}，方便串接夜間散步或回住宿。`
            : `Use ${dinner.name} as the evening stop before returning to the hotel.`,
          source: "ai",
          location: toLocation(dinner, `${request.destination} 建議晚餐停留點`),
        },
      ],
    };
  });

  return {
    summary,
    days,
    warnings: [],
  };
}

export async function generateTripPlan(
  request: TripPlanRequest,
  memoryContext?: string,
  progressSessionId?: string,
): Promise<{
  plan: TripPlanResult;
  sources: Record<string, ChatSource>;
  diagnostics: {
    planGenerationMode: "model" | "fallback";
    parseMode: "direct" | "repaired" | "normalized" | "fallback";
    retryCount: number;
  };
}> {
  let externalResearch = "";
  let researchSources: Record<string, ChatSource> = {};
  let researchPlaceHits: PlaceSearchHit[] = [];
  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢景點、交通與天氣",
    detail: "正在蒐集景點、美食、活動與天氣資料。",
    status: "running",
  });
  const searchQuery = [
    request.destination,
    request.preferences.interests.join(" "),
    request.preferences.mustVisit?.join(" ") || "",
    request.preferences.notes || "",
    "景點 美食 餐廳 活動 交通 營業時間",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const webSearch = await runWebSearch(searchQuery, serverConfig.aiWebSearchMaxResults, progressSessionId);
  try {
    const reqs = buildTripPlanResearchRequests(request);
    if (reqs.length) {
      const digest = await executeTravelToolRequests(reqs, {
        destination: request.destination,
        days: request.days,
        budget: request.budget,
        tripStartDate: request.tripStartDate,
        tripEndDate: request.tripEndDate,
        preferences: request.preferences,
        itinerary: request.itineraryDraft,
      }, progressSessionId);
      externalResearch = digest.text.trim();
      researchSources = digest.sources;
      researchPlaceHits = digest.placeHits;
    }
  } catch (error) {
    console.warn("[trip-plan] research_failed", error);
  }
  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢景點、交通與天氣",
    detail: "外部資料蒐集完成。",
    status: "completed",
  });

  const itineraryUserContent = buildItineraryPrompt(request, memoryContext, {
    externalResearch: externalResearch || undefined,
    webSearchDigest: webSearch.digest || undefined,
  });

  const requestMessages = [
    {
      role: "system" as const,
      content:
        "You generate structured travel itineraries. Output valid JSON only with realistic daily flows.",
    },
    {
      role: "user" as const,
      content: itineraryUserContent,
    },
  ];

  let raw: string;
  let retryCount = 0;
  publishProgressStep(progressSessionId, {
    phase: "compose",
    label: "整理每日路線與節奏",
    detail: "正在根據查詢結果安排每日動線。",
    status: "running",
    provider: "ollama",
  });
  try {
    raw = await chatWithOllama({
      format: "json",
      task: "trip-plan",
      messages: requestMessages,
    });
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      retryCount += 1;
      try {
        raw = await chatWithOllama({
          format: "json",
          task: "trip-plan",
          messages: requestMessages,
        });
      } catch {
        const fallback = buildFallbackTripPlan(request, researchPlaceHits);
        console.warn("[trip-plan] timeout,fallback");
        publishProgressStep(progressSessionId, {
          phase: "compose",
          label: "整理每日路線與節奏",
          detail: "已改用 fallback 行程完成輸出。",
          status: "completed",
          provider: "ollama",
        });
        return {
          plan: enrichPlanWithSearchSources(fallback, webSearch.results, webSearch.warning),
          sources: researchSources,
          diagnostics: {
            planGenerationMode: "fallback",
            parseMode: "fallback",
            retryCount,
          },
        };
      }
    } else {
      throw error;
    }
  }

  try {
    const parsed = parseTripPlanResponse(raw, request);
    if (hasTemplatePollutionWarning(parsed.result.warnings)) {
      throw new StructuredOutputError("MODEL_OUTPUT_TEMPLATE_POLLUTION");
    }
    console.info(`[trip-plan] parse_mode=${parsed.diagnostics.parseMode} retry_count=${retryCount}`);
    publishProgressStep(progressSessionId, {
      phase: "compose",
      label: "整理每日路線與節奏",
      detail: "每日動線整理完成。",
      status: "completed",
      provider: "ollama",
    });
    return {
      plan: enrichPlanWithSearchSources(parsed.result, webSearch.results, webSearch.warning),
      sources: researchSources,
      diagnostics: {
        planGenerationMode: "model",
        parseMode: parsed.diagnostics.parseMode,
        retryCount,
      },
    };
  } catch (error) {
    if (!(error instanceof StructuredOutputError)) {
      throw error;
    }
    console.warn(
      `[trip-plan] parse_issue=${error.message === "MODEL_OUTPUT_JSON_MISSING" ? "json_missing" : "json_invalid"}`,
    );

    let retriedRaw: string;
    retryCount += 1;
    try {
      retriedRaw = await chatWithOllama({
        format: "json",
        task: "trip-plan",
        messages: [
          requestMessages[0],
          {
            role: "user",
            content: buildItineraryPrompt(request, memoryContext, {
              retryMode: "strict-format",
              externalResearch: externalResearch || undefined,
              webSearchDigest: webSearch.digest || undefined,
            }),
          },
        ],
      });
    } catch (retryModelError) {
      if (retryModelError instanceof OllamaRequestError) {
        try {
          retryCount += 1;
          retriedRaw = await chatWithOllama({
            format: "json",
            task: "trip-plan",
            messages: [
              requestMessages[0],
              {
                role: "user",
                content: buildItineraryPrompt(request, memoryContext, {
                  retryMode: "strict-format",
                  externalResearch: externalResearch || undefined,
                  webSearchDigest: webSearch.digest || undefined,
                }),
              },
            ],
          });
        } catch {
          const fallback = buildFallbackTripPlan(request, researchPlaceHits);
          console.warn("[trip-plan] timeout,fallback");
          publishProgressStep(progressSessionId, {
            phase: "compose",
            label: "整理每日路線與節奏",
            detail: "已改用 fallback 行程完成輸出。",
            status: "completed",
            provider: "ollama",
          });
          return {
            plan: enrichPlanWithSearchSources(fallback, webSearch.results, webSearch.warning),
            sources: researchSources,
            diagnostics: {
              planGenerationMode: "fallback",
              parseMode: "fallback",
              retryCount,
            },
          };
        }
      } else {
        throw retryModelError;
      }
    }

    try {
      const parsed = parseTripPlanResponse(retriedRaw, request);
      if (hasTemplatePollutionWarning(parsed.result.warnings)) {
        throw new StructuredOutputError("MODEL_OUTPUT_TEMPLATE_POLLUTION");
      }
      if (parsed.diagnostics.parseMode === "normalized") {
        console.info("[trip-plan] normalized");
      }
      publishProgressStep(progressSessionId, {
        phase: "compose",
        label: "整理每日路線與節奏",
        detail: "每日動線整理完成。",
        status: "completed",
        provider: "ollama",
      });
      return {
        plan: enrichPlanWithSearchSources(parsed.result, webSearch.results, webSearch.warning),
        sources: researchSources,
        diagnostics: {
          planGenerationMode: "model",
          parseMode: parsed.diagnostics.parseMode,
          retryCount,
        },
      };
    } catch (retryError) {
      if (!(retryError instanceof StructuredOutputError)) {
        throw retryError;
      }
      const fallback = buildFallbackTripPlan(request, researchPlaceHits);
      console.warn(
        `[trip-plan] ${retryError.message === "MODEL_OUTPUT_JSON_MISSING" ? "json_missing" : "json_invalid"},fallback`,
      );
      publishProgressStep(progressSessionId, {
        phase: "compose",
        label: "整理每日路線與節奏",
        detail: "已改用 fallback 行程完成輸出。",
        status: "completed",
        provider: "ollama",
      });
      return {
        plan: enrichPlanWithSearchSources(fallback, webSearch.results, webSearch.warning),
        sources: researchSources,
        diagnostics: {
          planGenerationMode: "fallback",
          parseMode: "fallback",
          retryCount,
        },
      };
    }
  }
}

export async function buildMapPlanningNotes(request: TripPlanRequest): Promise<string> {
  return chatWithOllama({
    task: "travel-chat",
    messages: [
      {
        role: "system",
        content:
          "You summarize why a travel plan should be represented in a map view. Keep it concise.",
      },
      {
        role: "user",
        content: buildMapPlanningPrompt(request),
      },
    ],
  });
}

export async function chatWithTravelAssistant(input: {
  message: string;
  messages?: ChatMessage[];
  context?: ChatContext;
  structuredTravelPlanning?: boolean;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
  progressSessionId?: string;
  memoryContext?: string;
  forceStructuredRevision?: boolean;
}): Promise<ChatResponsePayload> {
  const itineraryInquiryResponse = buildExistingItineraryInquiryResponse({
    message: input.message,
    context: input.context,
    questionAnswers: input.questionAnswers,
  });
  if (itineraryInquiryResponse) {
    return itineraryInquiryResponse;
  }

  const itineraryPatchResponse = await buildExistingItineraryPatchResponse({
    message: input.message,
    messages: input.messages,
    context: input.context,
    memoryContext: input.memoryContext,
    progressSessionId: input.progressSessionId,
  });
  if (itineraryPatchResponse) {
    return itineraryPatchResponse;
  }

  if (input.structuredTravelPlanning) {
    const structuredTripResponse = await handleStructuredTripWorkflow({
      message: input.message,
      context: input.context,
      tripProfile: input.tripProfile,
      questionAnswers: input.questionAnswers,
      progressSessionId: input.progressSessionId,
      memoryContext: input.memoryContext,
      forceStructuredRevision: input.forceStructuredRevision,
    });
    if (structuredTripResponse) {
      return structuredTripResponse;
    }
  }

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "整理旅遊問題",
    detail: "正在判斷這次提問需要哪些旅遊資訊。",
    status: "running",
  });
  const language = detectResponseLanguage(input.message);
  const researchPrompt = buildChatResearchPlanningPrompt({
    message: input.message,
    context: input.context,
    memoryContext: input.memoryContext,
  });
  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "整理旅遊問題",
    detail: "已整理問題脈絡。",
    status: "completed",
  });

  const perRoundTimeout = Math.min(90_000, Math.max(45_000, Math.floor(serverConfig.ollamaTimeoutMs * 0.75)));

  const shouldResearch = needsTravelResearch({
    message: input.message,
    context: input.context,
  });
  let digest: { text: string; placeHits: PlaceSearchHit[]; sources: Record<string, ChatSource> } = {
    text: "",
    placeHits: [],
    sources: {},
  };
  let webSearch: WebSearchBundle = { results: [], digest: "" };
  if (shouldResearch) {
    let rawResearch = "";
    publishProgressStep(input.progressSessionId, {
      phase: "research",
      label: "查詢外部資訊",
      detail: "正在規劃並執行外部資料查詢。",
      status: "running",
    });
    try {
      rawResearch = await chatWithOllama({
        task: "travel-chat",
        format: "json",
        timeoutMs: perRoundTimeout,
        messages: [
          { role: "system", content: researchPrompt.system },
          ...normalizeHistory(input.context, language),
          ...normalizeConversationHistory(input.messages),
          { role: "user", content: researchPrompt.user },
        ],
      });
    } catch {
      rawResearch = JSON.stringify({ phase: "research", toolRequests: [] });
    }

    let toolRequests = parseTravelToolRequestsFromModel(
      extractJsonObject(rawResearch)?.toolRequests,
    );
    if (!toolRequests.length) {
      toolRequests = buildDefaultTravelToolRequests(input.message, input.context);
    }

    digest = await executeTravelToolRequests(toolRequests, input.context, input.progressSessionId);
    const webSearchQuery = [input.context?.destination || "", input.message].filter(Boolean).join(" ").trim();
    webSearch = await runWebSearch(webSearchQuery, serverConfig.aiWebSearchMaxResults, input.progressSessionId);
    publishProgressStep(input.progressSessionId, {
      phase: "research",
      label: "查詢外部資訊",
      detail: "外部資料查詢完成。",
      status: "completed",
    });
  }
  const digestText =
    shouldResearch
      ? digest.text.trim() ||
        "我目前先根據已取得的資料整理建議，建議出發前再確認營業時間與交通資訊。"
      : "";

  const prompt = buildChatPrompt(
    input.message,
    input.context,
    input.memoryContext,
    digestText,
    webSearch.digest || undefined,
  );

  publishProgressStep(input.progressSessionId, {
    phase: "compose",
    label: "生成回覆",
    detail: "正在整理回覆內容。",
    status: "running",
    provider: "ollama",
  });
  const raw = await chatWithOllama({
    task: "travel-chat",
    format: "json",
    timeoutMs: perRoundTimeout,
    messages: [
      { role: "system", content: prompt.system },
      ...normalizeHistory(input.context, language),
      ...normalizeConversationHistory(input.messages),
      { role: "user", content: prompt.user },
    ],
  });

  const structured = parseStructuredChatOutput(raw);
  const proposedChanges =
    digest.placeHits.length > 0
      ? filterProposedChangesByVerifiedPlaces(structured.proposedChanges, digest.placeHits)
      : structured.proposedChanges;
  const replyText = structured.replyText;
  const sources =
    serverConfig.aiWebSearchRequireCitations && webSearch.results.length
      ? toCitationList(webSearch.results, 3)
      : undefined;
  publishProgressStep(input.progressSessionId, {
    phase: "compose",
    label: "生成回覆",
    detail: "回覆已完成。",
    status: "completed",
    provider: "ollama",
  });

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: replyText,
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      responseType: "text_message",
      proposedChanges,
      sources,
    },
    proposedChanges,
  };
}
