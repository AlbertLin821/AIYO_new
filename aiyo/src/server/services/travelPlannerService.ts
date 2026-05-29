import { filterProposedChangesByVerifiedPlaces } from "@/server/ai/placeNameMatch";
import { normalizeConversationHistory } from "@/server/services/travelPlanner/chatConversation";
import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { chatWithOllama, OllamaRequestError, type OllamaMessage } from "@/server/ai/ollamaClient";
import { decideTravelAgentMode } from "@/server/ai/travelAgentOrchestrator";
import {
  questionCardJsonSchema,
  structuredChatOutputJsonSchema,
  travelResearchToolRequestJsonSchema,
  tripPlanResultJsonSchema,
} from "@/server/ai/schemas/travelPlanningSchemas";
import { buildQuestionCardDesignerSystemPrompt } from "@/server/ai/policies/travelPlanningPolicy";
import { sanitizeDynamicQuestionCard } from "@/server/ai/validators/questionCardValidator";
import {
  validateTravelPlanResponseQuality,
  validateTripPlanQuality,
} from "@/server/ai/validators/travelPlanValidator";
import {
  buildChatPrompt,
  buildChatResearchPlanningPrompt,
  buildItineraryPatchIntentPrompt,
  buildItineraryPrompt,
  buildMapPlanningPrompt,
  detectResponseLanguage,
} from "@/server/ai/promptBuilder";
import { serverConfig } from "@/server/config";
import {
  decideSearchIntent,
  formatTravelSearchContextForPrompt,
  toTravelSearchContext,
} from "@/server/search/searchIntent";
import { runUnifiedWebSearch, type WebSearchBackend } from "@/server/search/webSearchService";
import type { WebSearchResult } from "@/server/search/searxngClient";
import { mergeChatSources, normalizeWebSearchSources, pickCitationIdsForText } from "@/server/chat/sourceNormalization";
import { registerChatSources } from "@/server/chat/sourcePreviewStore";
import { publishChatProgress } from "@/server/chat/chatProgressStore";
import { applyRevisionInstructionToProfile } from "@/server/chat/tripRevision";
import { enrichTripPlanWithRouteTravelTimes } from "@/server/geo/routeTravelTimeService";
import { runStructuredTripWorkflow } from "@/server/services/travelPlanningWorkflowService";
import {
  buildDefaultTravelToolRequests,
  buildTripPlanResearchRequests,
  executeTravelToolRequests,
  parseTravelToolRequestsFromModel,
} from "@/server/services/travelResearchTools";
import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import { parseTripPlanResponse, StructuredOutputError } from "@/server/ai/responseParser";
import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import type {
  AiProposedChange,
  ChatContext,
  ChatMessage,
  ChatQuestionAnswer,
  ChatResponsePayload,
  ChatSource,
  CitationText,
  QuestionCardPayload,
  StatusStepPayload,
  StatusStepProvider,
  SearchDecision,
  TravelAgentDecision,
  TravelSearchContext,
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

function buildNaturalTravelAgentResponse(decision: TravelAgentDecision): ChatResponsePayload {
  const content =
    decision.userFacingGuidance ||
    decision.preferenceConfirmation?.prompt ||
    "我可以先幫你整理旅遊方向，再依你的偏好排成可執行的行程。";

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content,
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      responseType: "text_message",
      proposedChanges: [],
    },
    proposedChanges: [],
    travelAgentDecision: decision,
  };
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
  if (type === "remove_itinerary_day") {
    if (!Number.isFinite(day) || day <= 0) {
      return null;
    }
    return {
      type: "remove_itinerary_day",
      day: Math.floor(day),
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
    transport: record.transport ? String(record.transport) : undefined,
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
  searchContext?: TravelSearchContext;
};

const TRIP_PLAN_COMPOSE_TIMEOUT_MS = 90_000;
const CHAT_COMPOSE_TIMEOUT_MS = 75_000;
const TRAVEL_CHAT_TIMEOUT_FALLBACK =
  "我先保留目前的行程脈絡；你可以再補充想調整的地點、天數或預算，我會用更精簡的查詢重新規劃。";

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

function buildTravelChatTimeoutFallbackText(digestText: string): string {
  const normalized = digestText.trim();
  return normalized || TRAVEL_CHAT_TIMEOUT_FALLBACK;
}

function delay(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function chatWithOllamaTimeoutRetry(request: Parameters<typeof chatWithOllama>[0]): Promise<string> {
  const retryCount = Math.max(0, serverConfig.ollamaTimeoutRetryCount);
  const retryDelayMs = Math.max(0, serverConfig.ollamaTimeoutRetryDelayMs);
  const maxAttempts = 1 + retryCount;
  let lastTimeoutError: OllamaRequestError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await chatWithOllama(request);
    } catch (error) {
      if (!(error instanceof OllamaRequestError)) {
        throw error;
      }
      if (!error.isTimeout) {
        throw error;
      }
      lastTimeoutError = error;
      if (attempt >= maxAttempts - 1) {
        break;
      }
      await delay(retryDelayMs);
    }
  }

  throw lastTimeoutError ?? new OllamaRequestError("Ollama request timed out", undefined, "timeout");
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
  if (profile.destination) {
    profile.destination = normalizeDestinationLabel(profile.destination);
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
  const itineraryDerivedDays = Math.max(
    0,
    ...(context?.itinerary?.map((day) => day.dayNumber).filter((day) => Number.isFinite(day) && day > 0) || [0]),
  );
  const contextDerivedDays =
    itineraryDerivedDays > 0
      ? itineraryDerivedDays
      : typeof context?.days === "number" && context.days > 1
        ? Math.floor(context.days)
        : 0;
  if (!profile.duration_days && contextDerivedDays > 0) {
    profile.duration_days = contextDerivedDays;
    profile.duration_nights = Math.max(0, contextDerivedDays - 1);
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
    message.match(/(?:想去|我要去|我想去|要去|去|到)\s*([^，。,\s]+?)(?:了|玩|旅遊|旅行|自由行|行程|[一二兩三四五六七八九十\d]+\s*天|$)/u)?.[1] ||
    message.match(/^([^，。,\s]{2,12})(?:旅遊|旅行|自由行|行程)/u)?.[1];
  if (destination && !/哪裡|哪邊|幾天|多久/u.test(destination)) {
    next.destination = normalizeDestinationLabel(destination.trim());
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

function normalizeDestinationLabel(destination: string): string {
  const trimmed = destination.trim();
  if (/^東基$|^東急$/u.test(trimmed)) {
    return "東京";
  }
  return trimmed;
}

type DestinationTravelHints = {
  isJapan: boolean;
  isKumamotoAsoRegion: boolean;
  isKyushuDrivingFriendly: boolean;
  isOnsenDestination: boolean;
};

function getDestinationTravelHints(destination: string): DestinationTravelHints {
  const dest = normalizeDestinationLabel(destination);
  const isJapan =
    /日本|東京|大阪|京都|北海道|九州|沖繩|熊本|福岡|阿蘇|黑川|由布院|別府|箱根|伊豆|奈良|橫濱|神戶|名古屋|仙台|金澤|廣島|長崎|鹿兒島|那霸/u.test(
      dest,
    );
  const isKumamotoAsoRegion = /熊本|阿蘇|黑川|由布院|別府|天草/u.test(dest);
  const isKyushuDrivingFriendly = /熊本|福岡|九州|阿蘇|黑川|由布院|別府|鹿兒島|長崎|宮崎/u.test(dest);
  const isUrbanJapan = /東京|大阪|京都|名古屋|福岡市|橫濱|神戶|札幌|仙台/u.test(dest);
  const isOnsenDestination =
    (isKumamotoAsoRegion || /箱根|伊豆|登別|草津|有馬|道後|別府|由布院|黑川/u.test(dest)) && !isUrbanJapan;

  return {
    isJapan,
    isKumamotoAsoRegion,
    isKyushuDrivingFriendly,
    isOnsenDestination,
  };
}

function buildPreferenceOptionLabels(destination: string) {
  const dest = normalizeDestinationLabel(destination);
  const hints = getDestinationTravelHints(dest);

  let nature = "自然風景與戶外景點";
  if (hints.isKumamotoAsoRegion) {
    nature = "自然風景（阿蘇、山景、海景等）";
  } else if (/東京|橫濱|埼玉|千葉/u.test(dest)) {
    nature = "城市綠地與近郊自然";
  } else if (/北海道/u.test(dest)) {
    nature = "自然風景（山岳、湖泊、海岸等）";
  } else if (hints.isJapan) {
    nature = "自然風景（山景、海景、國定公園等）";
  }

  return {
    food: "美食與在地小吃",
    onsen: hints.isOnsenDestination ? "溫泉放鬆與慢活" : "放鬆體驗與慢活節奏",
    nature,
    history: "歷史古蹟與文化景點",
    city_walk: "城市散步與逛街購物",
    local_culture: "在地文化與特色街區",
    shopping: "購物、伴手禮與市集",
  } as const;
}

function buildPreferenceOptions(profile: TripProfile): Array<{
  label: string;
  value: string;
  recommended?: boolean;
}> {
  const destination = profile.destination || "";
  const hints = getDestinationTravelHints(destination);
  const labels = buildPreferenceOptionLabels(destination);
  const values = uniqueStrings([
    ...(profile.preferences.includes("food") ? ["food"] : []),
    ...(profile.preferences.includes("onsen") ? ["onsen"] : []),
    ...(hints.isOnsenDestination ? ["onsen"] : []),
    ...(hints.isJapan ? ["nature", "history", "city_walk"] : ["local_culture", "nature", "city_walk"]),
    "shopping",
  ]);

  return values.map((value) => ({
    label: labels[value as keyof typeof labels] || value,
    value,
    recommended: value === "food" || (value === "onsen" && hints.isOnsenDestination) ? true : undefined,
  }));
}

function buildTransportOptions(destination: string): Array<{
  label: string;
  value: string;
  recommended?: boolean;
}> {
  const hints = getDestinationTravelHints(destination);
  const prefersDriving = hints.isKyushuDrivingFriendly || /北海道|沖繩/u.test(destination);
  return [
    { label: "大眾運輸", value: "public_transport", recommended: !prefersDriving },
    { label: "自駕", value: "self_drive", recommended: prefersDriving },
    { label: "包車 / 一日遊行程", value: "charter_or_tour" },
    { label: "還不確定，請 AI 依路線建議", value: "ai_recommend" },
  ];
}

export function buildQuestionCard(profile: TripProfile, _context?: ChatContext): QuestionCardPayload | null {
  const destination = normalizeDestinationLabel(profile.destination || "這次");

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

  return null;
}

const DYNAMIC_QUESTION_CARD_TIMEOUT_MS = 8_000;

function summarizeItineraryForQuestionCard(context?: ChatContext): string {
  const days = context?.itinerary || [];
  if (!days.length) {
    return "目前沒有既有行程。";
  }
  return days
    .slice(0, 4)
    .map((day) => {
      const items = day.items
        .slice(0, 5)
        .map((item) => `${item.time} ${item.title}`)
        .join("、");
      return `Day ${day.dayNumber}: ${items || "尚無安排"}`;
    })
    .join("\n");
}

function buildDynamicQuestionCardPrompt(input: {
  message: string;
  profile: TripProfile;
  context?: ChatContext;
  fallbackCard: QuestionCardPayload;
  memoryContext?: string;
}): { system: string; user: string } {
  const targetSlots = input.fallbackCard.questions.map((question) => ({
    slot: question.slot,
    type: question.type,
    fallbackQuestion: question.question,
    fallbackOptions: question.options?.map((option) => ({
      label: option.label,
      value: option.value,
      recommended: option.recommended,
    })),
  }));
  return {
    system: [
      buildQuestionCardDesignerSystemPrompt(),
      "Generate the next question_card from the current conversation, profile, and itinerary context.",
      "Every visible Traditional Chinese title, question, option label, helper text, placeholder, and action label must be natural and context-specific.",
      "Do not reuse generic template wording unless it is genuinely the best wording for this user.",
      "Use only the target slots listed by the user prompt. Keep slot and type values exactly as provided.",
    ].join("\n"),
    user: JSON.stringify({
      currentUserMessage: input.message,
      tripProfile: input.profile,
      memoryContext: input.memoryContext || null,
      itineraryContext: {
        destination: input.context?.destination || null,
        days: input.context?.days || null,
        summary: summarizeItineraryForQuestionCard(input.context),
      },
      targetSlots,
      fallbackCard: input.fallbackCard,
      instruction:
        "請依這輪對話動態設計 question_card。可以改寫標題、問題、提示文案、選項標籤與按鈕文字；但 slot/type/value 必須可被系統解析。",
    }),
  };
}

async function buildDynamicQuestionCard(input: {
  message: string;
  profile: TripProfile;
  context?: ChatContext;
  fallbackCard: QuestionCardPayload;
  memoryContext?: string;
}): Promise<QuestionCardPayload> {
  if (process.env.AIYO_DYNAMIC_QUESTION_CARD === "0") {
    return input.fallbackCard;
  }

  const prompt = buildDynamicQuestionCardPrompt(input);
  try {
    const raw = await chatWithOllama({
      task: "travel-chat",
      format: questionCardJsonSchema,
      timeoutMs: DYNAMIC_QUESTION_CARD_TIMEOUT_MS,
      options: { temperature: 0, top_p: 0.9, num_ctx: 16_384 },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    const parsed = extractJsonObject(raw);
    return sanitizeDynamicQuestionCard(parsed, input.fallbackCard) || input.fallbackCard;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[question-card] dynamic_generation_fallback=${message}`);
    return input.fallbackCard;
  }
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
    /新增|加入|加上|刪除|刪掉|移除|修改|調整|改成|套用|儲存|建立|創建|產生|重新規劃|幫我(?:安排|規劃|新增|加入|調整|修改|刪除|刪掉|移除)|請(?:安排|規劃|新增|加入|調整|修改|刪除|刪掉|移除)/u.test(message);
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
  return /(?:幫我|請|可以|能不能|想要|我要|我想|需要).{0,12}(?:規劃|安排|建立|創建|產生|生成|做一份|排|新增|加入|加上|修改|調整|重排|重新規劃)|(?:規劃|安排|建立|產生|生成|新增|加入|修改|調整|重排|重新規劃).{0,12}(?:行程|旅行|旅遊|景點|活動|餐廳|美食)|(?:想去|我要去|我想去).{0,30}(?:旅遊|旅行|自由行|[一二兩三四五六七八九十\d]+\s*天)|(?:玩|排)[一二兩三四五六七八九十\d]+\s*天|[一二兩三四五六七八九十\d]+\s*天[一二兩三四五六七八九十\d]*\s*夜(?:行程|旅行|旅遊|自由行)?/u.test(message);
}

function isExistingItineraryPatchRequest(input: {
  message: string;
  context?: ChatContext;
}): boolean {
  if (!input.context?.itinerary?.length) {
    return false;
  }
  const message = input.message.trim();
  const mutatesCurrentItinerary =
    /新增|加入|加上|刪除|刪掉|移除|取消|去掉|修改|調整|改成|換成|改到|提前|延後|移到/u.test(message) ||
    (/(?:不要了|不用了)/u.test(message) &&
      /(?:(?:最後|最后)\s*(?:一)?\s*天|第\s*[\d一二兩三四五六七八九十]+\s*天|行程)/u.test(message));
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
  let cleaned = (value || "")
    .replace(/^[「『"'\s]+|[」』"'\s]+$/gu, "")
    .replace(/(?:其他|其餘)安排.*$/u, "")
    .replace(/先維持不變.*$/u, "")
    .replace(/即可.*$/u, "")
    .trim();
  const dayPrefixed = cleaned.match(/^[第地]\s*[\d一二兩三四五六七八九十]+\s*天(?:的)?\s*(.+)$/u);
  if (dayPrefixed?.[1]) {
    cleaned = dayPrefixed[1].trim();
  }
  return cleaned;
}

const DAY_PREFIX_PATTERN = "[第地]\\s*(\\d+|[一二兩三四五六七八九十]+)\\s*天";

function parseExplicitDayNumberFromMessage(message: string): number | null {
  const match = message.match(new RegExp(`${DAY_PREFIX_PATTERN}`, "u"));
  if (!match?.[1]) {
    return null;
  }
  return parsePatchDayNumber(match[1]);
}

function parseRemoveItineraryItemRequest(message: string): { day: number; title: string } | null {
  const match = message.match(
    new RegExp(
      `(?:刪除|刪掉|移除|取消|去掉)[\\s\\S]{0,16}?${DAY_PREFIX_PATTERN}(?:的)?\\s*(.+?)(?:$|[，。,])`,
      "u",
    ),
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const day = parsePatchDayNumber(match[1]);
  const title = cleanupPatchTitle(match[2]);
  if (!day || !title || /^(?:行程|安排|計畫|规划|規劃|内容|內容)$/u.test(title)) {
    return null;
  }
  return { day, title };
}

function buildRemoveItineraryItemPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const parsed = parseRemoveItineraryItemRequest(input.message);
  if (!parsed || !input.context?.itinerary?.length) {
    return null;
  }

  const targetDay = input.context.itinerary.find((day) => day.dayNumber === parsed.day);
  if (!targetDay) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `目前行程中沒有第 ${parsed.day} 天，無法移除「${parsed.title}」。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  const target = matchItineraryItemFromContext({
    context: input.context,
    day: parsed.day,
    title: parsed.title,
  });
  if (!target) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `第 ${parsed.day} 天找不到「${parsed.title}」。請確認天數或景點名稱是否正確。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  const change = {
    type: "remove_itinerary_item" as const,
    day: target.dayNumber,
    itemId: target.item.id,
    targetTitle: target.item.title,
    reason: `依照使用者要求，自第 ${parsed.day} 天移除此行程項目`,
    source: "ai-chat" as const,
  };

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `已從第 ${target.dayNumber} 天移除「${target.item.title}」。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      proposedChanges: [change],
    },
    proposedChanges: [change],
  };
}

export function resolveProposedChangesFromContext(input: {
  changes: AiProposedChange[];
  context?: ChatContext;
  userMessage?: string;
}): { resolved: AiProposedChange[]; issues: string[] } {
  const itinerary = input.context?.itinerary;
  if (!itinerary?.length || !input.changes.length) {
    return { resolved: [], issues: [] };
  }

  const explicitDayFromMessage = input.userMessage
    ? parseExplicitDayNumberFromMessage(input.userMessage)
    : null;
  const resolved: AiProposedChange[] = [];
  const issues: string[] = [];

  for (const change of input.changes) {
    if (change.type === "remove_itinerary_day") {
      const day =
        explicitDayFromMessage ??
        (input.userMessage
          ? parseRemoveWholeDayNumber(input.userMessage, itinerary.length)
          : null) ??
        Math.floor(Number(change.day));
      if (!itinerary.some((entry) => entry.dayNumber === day)) {
        issues.push(`目前行程中沒有第 ${day} 天。`);
        continue;
      }
      if (itinerary.length <= 1) {
        issues.push("目前行程只剩一天，無法刪除整天。");
        continue;
      }
      resolved.push({ ...change, day });
      continue;
    }

    if (change.type === "add_itinerary_item") {
      resolved.push({
        ...change,
        day: Math.max(1, Math.floor(Number(change.day) || 1)),
      });
      continue;
    }

    if (change.type === "remove_itinerary_item" || change.type === "update_itinerary_item") {
      const scopedDay = explicitDayFromMessage ?? change.day ?? undefined;
      let target: ReturnType<typeof matchItineraryItemFromContext> = null;

      if (change.itemId) {
        for (const day of itinerary) {
          if (scopedDay && day.dayNumber !== scopedDay) {
            continue;
          }
          const item = day.items.find((candidate) => candidate.id === change.itemId);
          if (item) {
            target = { dayNumber: day.dayNumber, item };
            break;
          }
        }
      }

      if (!target) {
        const lookupTitle =
          change.targetTitle ||
          (change.type === "update_itinerary_item" ? change.title : undefined) ||
          "";
        target = matchItineraryItemFromContext({
          context: input.context,
          day: scopedDay ?? null,
          title: lookupTitle,
        });
      }

      const label = change.targetTitle || (change.type === "update_itinerary_item" ? change.title : "") || "指定項目";
      if (!target) {
        if (scopedDay) {
          issues.push(`第 ${scopedDay} 天找不到「${label}」。`);
        } else {
          issues.push(`找不到「${label}」。`);
        }
        continue;
      }

      if (change.type === "remove_itinerary_item") {
        resolved.push({
          ...change,
          day: target.dayNumber,
          itemId: target.item.id,
          targetTitle: target.item.title,
          reason: change.reason || `依照使用者要求，自第 ${target.dayNumber} 天移除此行程項目`,
        });
        continue;
      }

      resolved.push({
        ...change,
        day: target.dayNumber,
        itemId: target.item.id,
        targetTitle: target.item.title,
      });
    }
  }

  return { resolved, issues };
}

function summarizeProposedChangesForReply(changes: AiProposedChange[]): string {
  if (changes.length !== 1) {
    return `已套用 ${changes.length} 項行程修改。`;
  }

  const change = changes[0];
  if (change.type === "remove_itinerary_day") {
    return `已刪除第 ${change.day} 天行程，後續天數會自動重新編號。`;
  }
  if (change.type === "remove_itinerary_item") {
    return `已從第 ${change.day} 天移除「${change.targetTitle || "指定項目"}」。`;
  }
  if (change.type === "update_itinerary_item") {
    const nextTitle = change.title || change.locationName || "新內容";
    return `已將第 ${change.day} 天的「${change.targetTitle || "指定項目"}」調整為「${nextTitle}」。`;
  }
  if (change.type === "add_itinerary_item") {
    return `已將「${change.title}」加入第 ${change.day} 天行程。`;
  }
  return "已更新行程。";
}

function buildItineraryPatchResponsePayload(input: {
  content: string;
  proposedChanges: AiProposedChange[];
}): ChatResponsePayload {
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: input.content,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      proposedChanges: input.proposedChanges,
    },
    proposedChanges: input.proposedChanges,
  };
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

function parseRemoveWholeDayNumber(message: string, itineraryLength?: number): number | null {
  const beforeVerbMatch = message.match(
    new RegExp(
      `(?:刪除|刪掉|移除|取消|去掉)[\\s\\S]{0,24}?${DAY_PREFIX_PATTERN}(?:的)?(?:\\s*(?:行程|安排|計畫|规划|規劃|内容|內容))?(?=$|[。，,\\s])`,
      "u",
    ),
  );
  if (beforeVerbMatch?.[1]) {
    return parsePatchDayNumber(beforeVerbMatch[1]);
  }

  const afterVerbMatch = message.match(
    new RegExp(
      `${DAY_PREFIX_PATTERN}(?:的)?(?:\\s*(?:行程|安排|計畫|规划|規劃|内容|內容))?\\s*(?:刪除|刪掉|移除|取消|去掉)(?=$|[。，,\\s])`,
      "u",
    ),
  );
  if (afterVerbMatch?.[1]) {
    return parsePatchDayNumber(afterVerbMatch[1]);
  }

  const baMatch = message.match(
    new RegExp(
      `把\\s*${DAY_PREFIX_PATTERN}(?:的)?(?:\\s*(?:行程|安排|計畫|规划|規劃|内容|內容))?\\s*(?:刪除|刪掉|移除|取消|去掉)`,
      "u",
    ),
  );
  if (baMatch?.[1]) {
    return parsePatchDayNumber(baMatch[1]);
  }

  if (
    itineraryLength &&
    itineraryLength > 0 &&
    /(?:最後|最后)\s*(?:一)?\s*天/u.test(message) &&
    /(?:刪|移除|取消|去掉|不要)/u.test(message)
  ) {
    return itineraryLength;
  }

  return null;
}

function buildRemoveWholeDayPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const day = parseRemoveWholeDayNumber(input.message, input.context?.itinerary?.length);
  if (!day || !input.context?.itinerary?.length) {
    return null;
  }

  const targetDay = input.context.itinerary.find((entry) => entry.dayNumber === day);
  if (!targetDay) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `目前行程中沒有第 ${day} 天，無法刪除。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  if (input.context.itinerary.length <= 1) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "目前行程只剩一天，無法再刪除整天。若你想清空內容，可以告訴我要移除哪些活動。",
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  const change = {
    type: "remove_itinerary_day" as const,
    day,
    reason: "依照使用者要求刪除整天行程",
    source: "ai-chat" as const,
  };

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `已刪除第 ${day} 天行程，後續天數會自動重新編號。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      proposedChanges: [change],
    },
    proposedChanges: [change],
  };
}

function buildDeterministicItineraryPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  if (!input.context?.itinerary?.length) {
    return null;
  }

  const message = input.message.trim();

  const removeDayResponse = buildRemoveWholeDayPatchResponse({
    message,
    context: input.context,
  });
  if (removeDayResponse) {
    return removeDayResponse;
  }

  const removeItemResponse = buildRemoveItineraryItemPatchResponse({
    message,
    context: input.context,
  });
  if (removeItemResponse) {
    return removeItemResponse;
  }

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
    new RegExp(
      `(?:刪除|刪掉|移除)\\s*(?:${DAY_PREFIX_PATTERN}(?:的)?)?\\s*([^\\n，。,]+?)(?:$|[，。,])`,
      "u",
    ),
  );
  if (removeMatch) {
    const day = parsePatchDayNumber(removeMatch[1]);
    const targetTitle = cleanupPatchTitle(removeMatch[2]);
    if (!targetTitle || /^(?:行程|安排|計畫|规划|規劃|内容|內容)$/u.test(targetTitle)) {
      return null;
    }
    const target = matchItineraryItemFromContext({
      context: input.context,
      day,
      title: targetTitle,
    });
    if (!target) {
      if (day) {
        return {
          reply: {
            id: `assistant_${Date.now()}`,
            role: "assistant",
            content: `第 ${day} 天找不到「${targetTitle}」。請確認天數或景點名稱是否正確。`,
            timestamp: nowChatTimestamp(),
            responseType: "text_message",
          },
        };
      }
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
  return /推薦|景點|美食|餐廳|咖啡|晚上|夜景|夜市|適合|附近|天氣|降雨|氣溫|營業時間|開到幾點|門票|交通|怎麼去|封路|活動|市集|祭典|今年|近期|最新|規劃|自由行|攻略|行程|動線|路線|蜜月|親子(?:遊)?|哪裡好玩|去哪/u.test(
    message,
  );
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
  if (normalized === "public_transport" || normalized === "transit") {
    return "大眾運輸";
  }
  if (normalized === "self_drive" || normalized === "driving") {
    return "自駕";
  }
  if (normalized === "walking" || normalized === "walk") {
    return "步行";
  }
  if (normalized === "bicycling" || normalized === "bicycle" || normalized === "bike") {
    return "自行車";
  }
  if (normalized === "taxi") {
    return "計程車";
  }
  if (normalized === "charter_or_tour") {
    return "包車 / 一日遊";
  }
  if (normalized === "ai_recommend") {
    return "依路線由 AI 建議交通方式";
  }
  return value;
}

function formatTransportMinutes(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} 分鐘`;
  }
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest > 0 ? `${hours} 小時 ${rest} 分鐘` : `${hours} 小時`;
}

function buildDayTransportationTexts(day: TripPlanDay): string[] {
  const routeTexts = day.items.flatMap((item, index) => {
    if (index === 0 || !item.transport?.trim()) {
      return [];
    }
    const previous = day.items[index - 1];
    const label = toUserFacingTransportLabel(item.transport);
    if (typeof item.transportDurationMinutes === "number" && item.transportDurationMinutes > 0) {
      const providerNote = item.transportDataSource === "google_routes" ? "（Google Maps 路線資料）" : "";
      return [
        `${previous.title} → ${item.title}：${label}，約 ${formatTransportMinutes(item.transportDurationMinutes)}${providerNote}`,
      ];
    }
    return [`${previous.title} → ${item.title}：${label}`];
  });
  if (routeTexts.length > 0) {
    return routeTexts;
  }
  return uniqueStrings(day.items.map((item) => item.transport || "").filter(Boolean))
    .slice(0, 4)
    .map(toUserFacingTransportLabel);
}

function hasTemplatePollutionWarning(warnings?: string[]): boolean {
  return (warnings || []).some((warning) => /^QUALITY:TEMPLATE_POLLUTION:/i.test(warning));
}

function hasTitleFormatViolationWarning(warnings?: string[]): boolean {
  return (warnings || []).some((warning) => /^QUALITY:TITLE_FORMAT_VIOLATION:/i.test(warning));
}

function assertTripPlanQualityWarnings(warnings?: string[]): void {
  if (hasTemplatePollutionWarning(warnings)) {
    throw new StructuredOutputError("MODEL_OUTPUT_TEMPLATE_POLLUTION");
  }
  if (hasTitleFormatViolationWarning(warnings)) {
    throw new StructuredOutputError("MODEL_OUTPUT_TITLE_FORMAT_VIOLATION");
  }
}

function assertTripPlanValidatorQuality(plan: TripPlanResult, request: TripPlanRequest): void {
  const issues = validateTripPlanQuality(plan, request);
  if (!issues.length) {
    return;
  }
  const issueSummary = issues.slice(0, 4).map((issue) => `${issue.path}:${issue.message}`).join("; ");
  console.warn(`[trip-plan] validator_quality_issue=${issueSummary}`);
  throw new StructuredOutputError("MODEL_OUTPUT_VALIDATION_FAILED");
}

function assertTravelPlanResponseValidatorQuality(plan: TravelPlanResponse): void {
  const issues = validateTravelPlanResponseQuality(plan);
  if (!issues.length) {
    return;
  }
  const issueSummary = issues.slice(0, 4).map((issue) => `${issue.path}:${issue.message}`).join("; ");
  console.warn(`[travel-plan-response] validator_quality_issue=${issueSummary}`);
  throw new StructuredOutputError("TRAVEL_PLAN_RESPONSE_VALIDATION_FAILED");
}

function buildWeatherAlertsFromSources(
  profile: TripProfile,
  sources: Record<string, ChatSource>,
): TravelPlanResponse["weather_alerts"] {
  const weatherSources = Object.values(sources).filter((source) => source.type === "weather");
  if (!weatherSources.length) {
    return [];
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

  return alerts.filter((alert) => Boolean(alert.citations?.length && alert.message.trim()));
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
  const assumptionTexts = uniqueStrings([...userFacingWarnings]);
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
        theme: cleanDayThemeLabel(day.theme || day.summary || `第 ${day.dayNumber} 天`),
        citations: cite(`${day.theme || ""} ${day.summary || ""}`.trim(), {
          preferredTypes: ["official", "web", "weather"],
        }),
        transportation: buildDayTransportationTexts(day)
          .slice(0, 4)
          .map((text) => citeText(text, { preferredTypes: ["official", "web"] })),
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
        tips: uniqueStrings(day.items.map((item) => item.sourceSnippet || "").filter(Boolean))
          .slice(0, 3)
          .map((text) => citeText(text, { preferredTypes: ["official", "weather", "web", "youtube"] }))
          .filter((item) => Boolean(item.citations?.length)),
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

async function buildPlanningFallbackReturn(input: {
  request: TripPlanRequest;
  researchPlaceHits: PlaceSearchHit[];
  webSearch: WebSearchBundle;
  researchSources: Record<string, ChatSource>;
  progressSessionId?: string;
  retryCount: number;
}) {
  const fallback = buildFallbackTripPlan(input.request, input.researchPlaceHits);
  console.warn("[trip-plan] model_unavailable,fallback");
  publishProgressStep(input.progressSessionId, {
    phase: "compose",
    label: "整理每日路線與節奏",
    detail: "模型回應過久，已改用快速 fallback 行程完成輸出。",
    status: "completed",
    provider: "ollama",
  });
  const enrichedPlan = enrichPlanWithSearchSources(
    enrichPlanLocationsFromPlaceHits(fallback, input.researchPlaceHits),
    input.webSearch.results,
    input.webSearch.warning,
  );
  return {
    plan: await enrichTripPlanWithRouteTravelTimes(enrichedPlan),
    sources: input.researchSources,
    diagnostics: {
      planGenerationMode: "fallback" as const,
      parseMode: "fallback" as const,
      retryCount: input.retryCount,
    },
  };
}

function cleanDayThemeLabel(value: string, chinese = true): string {
  const normalized = value.replace(/\s*(與周邊順遊|順遊)$/u, "").trim();
  if (!normalized) {
    return chinese ? "當日行程" : "Daily plan";
  }
  return normalized;
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
  return runStructuredTripWorkflow(input, {
    shouldHandle: (workflowInput) =>
      Boolean(workflowInput.forceStructuredRevision) || isTripWorkflowMessage(workflowInput),
    publishProgress: publishProgressStep,
    mergeTripProfile,
    updateTripProfileFromText,
    applyQuestionAnswers,
    buildFallbackQuestionCard: buildQuestionCard,
    buildDynamicQuestionCard,
    buildWaitingForInputStatusSteps,
    buildPlanningStatusSteps,
    profileToTripPlanRequest,
    generateTripPlan,
    loadSupplementarySources: async (profile, progressSessionId) => {
      const supplementaryWebBundle = await runWebSearch(
        [profile.destination || "", profile.preferences.join(" "), "行程 交通 美食"].filter(Boolean).join(" ").trim(),
        4,
        progressSessionId,
      );
      return normalizeWebSearchSources(supplementaryWebBundle.results);
    },
    mergeSources: mergeChatSources,
    registerSources: registerChatSources,
    buildRevisionMeta: buildTravelPlanRevisionMeta,
    toTravelPlan: (plan, profile, sources, revision) => {
      const travelPlan = convertTripPlanToTravelPlanWithSources(plan, profile, sources, revision);
      assertTravelPlanResponseValidatorQuality(travelPlan);
      return travelPlan;
    },
    now: nowChatTimestamp,
  });
}

function webSearchBackendToProgressProvider(backend: WebSearchBackend): StatusStepProvider {
  switch (backend) {
    case "serper":
      return "serper";
    case "tavily":
      return "tavily";
    default:
      return "serper";
  }
}

async function runWebSearch(
  query: string,
  limit?: number,
  progressSessionId?: string,
  options?: { skipIntentGate?: boolean; decision?: SearchDecision },
): Promise<WebSearchBundle> {
  const decision = options?.decision || decideSearchIntent({ message: query });
  const effectiveQuery = decision.query || query;
  const allowWithoutIntent = Boolean(options?.skipIntentGate);
  if (!serverConfig.aiWebSearchEnabled || (!allowWithoutIntent && !decision.shouldSearch)) {
    return { results: [], digest: "" };
  }

  const cap = Math.min(5, serverConfig.aiWebSearchMaxResults, decision.maxResults ?? limit ?? serverConfig.aiWebSearchMaxResults);
  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢一般網頁資料",
    detail: `正在查詢：${effectiveQuery}`,
    status: "running",
    query: effectiveQuery,
  });
  let results: WebSearchResult[] = [];
  let backend: WebSearchBackend = "none";
  let providerError: Error | null = null;
  try {
    const bundle = await runUnifiedWebSearch({
      query: effectiveQuery,
      limit: cap,
      providers: decision.providers,
    });
    results = bundle.results;
    backend = bundle.backend;
  } catch (error) {
    providerError = error instanceof Error ? error : new Error("Web search failed.");
    if (process.env.NODE_ENV !== "production") {
      console.warn("[web-search] provider_failed", providerError.message);
    }
  }
  const progressProvider = webSearchBackendToProgressProvider(backend);

  if (!results.length) {
    publishProgressStep(progressSessionId, {
      phase: "research",
      label: "查詢一般網頁資料",
      detail: "未取得可用結果，將改以既有資料繼續整理。",
      status: "failed",
      provider: progressProvider,
      query: effectiveQuery,
    });
    return {
      results: [],
      digest: "",
      warning: providerError?.message || "目前無法連線到 Serper 或 Tavily，因此以下內容可能不是最新資料。",
    };
  }
  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢一般網頁資料",
    detail: `已取得 ${results.length} 筆網頁結果。`,
    status: "completed",
    provider: progressProvider,
    query: effectiveQuery,
  });
  const searchContext =
    backend === "serper" || backend === "tavily"
      ? toTravelSearchContext({
          provider: backend,
          query: effectiveQuery,
          searchNeed: decision.searchNeed,
          results,
          maxResults: cap,
        })
      : undefined;
  return {
    results: results.slice(0, cap),
    digest: searchContext ? formatTravelSearchContextForPrompt(searchContext) : formatWebSearchDigest(results.slice(0, cap)),
    searchContext,
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

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "理解行程修改意圖",
    detail: "正在分析你想對目前行程做什麼。",
    status: "running",
  });

  let llmReplyText = "";
  let resolvedChanges: AiProposedChange[] = [];
  let resolutionIssues: string[] = [];
  const shouldUseLlmPatchIntent = process.env.AIYO_SKIP_LLM_PATCH !== "1";

  if (shouldUseLlmPatchIntent) {
    try {
      const intentPrompt = buildItineraryPatchIntentPrompt({
        message: input.message,
        context: input.context,
      });
      const raw = await chatWithOllama({
        task: "travel-chat",
        format: structuredChatOutputJsonSchema,
        options: { temperature: 0, top_p: 0.9, num_ctx: 16_384 },
        messages: [
          { role: "system", content: intentPrompt.system },
          ...normalizeHistory(input.context, detectResponseLanguage(input.message)),
          ...normalizeConversationHistory(input.messages),
          { role: "user", content: intentPrompt.user },
        ],
      });
      const structured = parseStructuredChatOutput(raw);
      llmReplyText = structured.replyText;
      const resolved = resolveProposedChangesFromContext({
        changes: structured.proposedChanges,
        context: input.context,
        userMessage: input.message,
      });
      resolvedChanges = resolved.resolved;
      resolutionIssues = resolved.issues;
    } catch {
      // Ollama unavailable — fall back to deterministic parsing below.
    }
  }

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "理解行程修改意圖",
    detail: resolvedChanges.length ? "已解析並對應可執行動作。" : "正在嘗試其他解析方式。",
    status: "completed",
  });

  if (resolvedChanges.length) {
    return buildItineraryPatchResponsePayload({
      content: summarizeProposedChangesForReply(resolvedChanges),
      proposedChanges: resolvedChanges,
    });
  }

  if (resolutionIssues.length) {
    return buildItineraryPatchResponsePayload({
      content: resolutionIssues.join("\n"),
      proposedChanges: [],
    });
  }

  const deterministicPatch = buildDeterministicItineraryPatchResponse({
    message: input.message,
    context: input.context,
  });
  if (deterministicPatch) {
    return deterministicPatch;
  }

  if (llmReplyText) {
    return buildItineraryPatchResponsePayload({
      content: llmReplyText,
      proposedChanges: [],
    });
  }

  return buildItineraryPatchResponsePayload({
    content:
      "我了解你想調整行程，但還無法確定要改哪一項。請告訴我天數和景點名稱，例如：「刪掉第 7 天的熊本城」。",
    proposedChanges: [],
  });
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

function isUsablePlaceHit(place: PlaceSearchHit | undefined): place is PlaceSearchHit {
  return Boolean(place && isUsableMapCoordinate(place.lat, place.lng));
}

function normalizePlaceLookupText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

function placeHitToLocation(place: PlaceSearchHit, description: string) {
  return {
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    description,
    address: place.formattedAddress || undefined,
    placeId: place.placeId,
    openingHours: place.openingHours,
    phoneNumber: place.phoneNumber,
    website: place.website,
    googleMapsUrl: place.googleMapsUrl,
    photoUrl: place.photoUrl,
    thumbnail: place.photoUrl,
    rating: place.rating,
    userRatingsTotal: place.userRatingsTotal,
    resolvedFrom: "google-geocode" as const,
    verified: true,
  };
}

function enrichPlanLocationsFromPlaceHits(plan: TripPlanResult, placeHits: PlaceSearchHit[]): TripPlanResult {
  const usableHits = dedupePlaceHitsByName(placeHits.filter(isUsablePlaceHit));
  if (!usableHits.length) {
    return plan;
  }

  const findPlaceForItem = (title: string, locationName?: string) => {
    const candidates = [locationName, title].filter((value): value is string => Boolean(value?.trim()));
    return usableHits.find((place) => {
      const placeKey = normalizePlaceLookupText(place.name);
      return candidates.some((candidate) => {
        const key = normalizePlaceLookupText(candidate);
        return key.length >= 2 && (placeKey.includes(key) || key.includes(placeKey));
      });
    });
  };

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        if (item.location && isUsableMapCoordinate(item.location.lat, item.location.lng)) {
          return item;
        }
        const place = findPlaceForItem(item.title, item.location?.name);
        if (!place) {
          return item.location ? { ...item, location: undefined } : item;
        }
        return {
          ...item,
          location: placeHitToLocation(place, item.notes || `${place.name} · ${day.theme || `Day ${day.dayNumber}`}`),
        };
      }),
    })),
  };
}

function createSyntheticFallbackStops(chinese: boolean): PlaceSearchHit[] {
  const names = chinese
    ? ["市區自由探索", "河岸散策", "文創街区漫步", "在地市場", "夜景收尾"]
    : [
        "Free exploration",
        "Riverside stroll",
        "Creative district walk",
        "Local market",
        "Evening viewpoint",
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

function buildSyntheticMealStop(chinese: boolean, slot: "lunch" | "dinner"): PlaceSearchHit {
  const name = chinese ? (slot === "lunch" ? "午餐" : "晚餐") : slot === "lunch" ? "Lunch" : "Dinner";
  return {
    name,
    formattedAddress: "",
    lat: 0,
    lng: 0,
    placeId: `synthetic_${slot}`,
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
  const validPlaces = dedupePlaceHitsByName(placeHits.filter((place) => place.name.trim().length > 1 && isUsablePlaceHit(place)));
  const restaurants = validPlaces.filter(isRestaurantLikePlace);
  const attractions = validPlaces.filter((place) => !isRestaurantLikePlace(place));
  const preferredStops = dedupePlaceHitsByName([
    ...validPlaces.filter((place) => normalizedMustVisit.has(place.name.trim().toLowerCase())),
    ...attractions,
  ]);
  const fallbackStops = dedupePlaceHitsByName([
    ...preferredStops,
    ...createSyntheticFallbackStops(chinese),
  ]);
  const fallbackMeals = restaurants.length ? dedupePlaceHitsByName(restaurants) : [];

  const toLocation = (place: PlaceSearchHit | undefined, description: string) =>
    isUsablePlaceHit(place) ? placeHitToLocation(place, description) : undefined;

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
    const lunch = fallbackMeals[index % fallbackMeals.length] || buildSyntheticMealStop(chinese, "lunch");
    const dinner = fallbackMeals[(index + 1) % fallbackMeals.length] || buildSyntheticMealStop(chinese, "dinner");
    const dayTheme = chinese
      ? cleanDayThemeLabel(`${uniqueStrings([morning.name, afternoon.name]).join("・")}`, true)
      : cleanDayThemeLabel(`${morning.name} and ${afternoon.name} route`, false);

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
            ? lunch.placeId?.startsWith("synthetic_")
              ? `於 ${morning.name} 附近安排午餐。`
              : `中午安排在 ${lunch.name} 用餐，保留休息時間。`
            : lunch.placeId?.startsWith("synthetic_")
              ? `Lunch near ${morning.name}.`
              : `Lunch at ${lunch.name} with a short rest buffer.`,
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
            ? dinner.placeId?.startsWith("synthetic_")
              ? `於 ${eveningAnchor.name} 附近安排晚餐與散步。`
              : `晚餐與收尾安排放在 ${dinner.name}，方便串接夜間散步或回住宿。`
            : dinner.placeId?.startsWith("synthetic_")
              ? `Dinner and an evening walk near ${eveningAnchor.name}.`
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
  const searchQuery = [
    request.destination,
    request.preferences.interests.join(" "),
    request.preferences.mustVisit?.join(" ") || "",
    request.preferences.notes || "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const planSearchDecision = decideSearchIntent({
    message: searchQuery,
    context: {
      destination: request.destination,
      days: request.days,
      budget: request.budget,
      tripStartDate: request.tripStartDate,
      tripEndDate: request.tripEndDate,
      preferences: request.preferences,
      itinerary: request.itineraryDraft,
    },
  });
  const webSearch = await runWebSearch(searchQuery, serverConfig.aiWebSearchMaxResults, progressSessionId, {
    decision: planSearchDecision,
  });
  if (planSearchDecision.shouldSearch) {
    publishProgressStep(progressSessionId, {
      phase: "research",
      label: "查詢景點、交通與天氣",
      detail: "這次需求需要近期外部資訊，正在查詢必要資料。",
      status: "running",
    });
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
  }

  const itineraryUserContent = buildItineraryPrompt(request, memoryContext, {
    externalResearch: externalResearch || undefined,
    webSearchDigest: webSearch.digest || undefined,
  });

  const requestMessages = [
    {
      role: "system" as const,
      content:
        "You generate structured travel itineraries. Output valid JSON only with realistic daily flows. Each item title must be one searchable place or venue name only.",
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
      format: tripPlanResultJsonSchema,
      task: "trip-plan",
      timeoutMs: TRIP_PLAN_COMPOSE_TIMEOUT_MS,
      options: { temperature: 0, top_p: 0.9, num_ctx: 32_768 },
      messages: requestMessages,
    });
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      return buildPlanningFallbackReturn({
        request,
        researchPlaceHits,
        webSearch,
        researchSources,
        progressSessionId,
        retryCount,
      });
    } else {
      throw error;
    }
  }

  try {
    const parsed = parseTripPlanResponse(raw, request);
    assertTripPlanQualityWarnings(parsed.result.warnings);
    assertTripPlanValidatorQuality(parsed.result, request);
    console.info(`[trip-plan] parse_mode=${parsed.diagnostics.parseMode} retry_count=${retryCount}`);
    publishProgressStep(progressSessionId, {
      phase: "compose",
      label: "整理每日路線與節奏",
      detail: "每日動線整理完成。",
      status: "completed",
      provider: "ollama",
    });
    return {
      plan: await enrichTripPlanWithRouteTravelTimes(
        enrichPlanWithSearchSources(enrichPlanLocationsFromPlaceHits(parsed.result, researchPlaceHits), webSearch.results, webSearch.warning),
      ),
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
        format: tripPlanResultJsonSchema,
        task: "trip-plan",
        timeoutMs: TRIP_PLAN_COMPOSE_TIMEOUT_MS,
        options: { temperature: 0, top_p: 0.9, num_ctx: 32_768 },
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
        return buildPlanningFallbackReturn({
          request,
          researchPlaceHits,
          webSearch,
          researchSources,
          progressSessionId,
          retryCount,
        });
      } else {
        throw retryModelError;
      }
    }

    try {
      const parsed = parseTripPlanResponse(retriedRaw, request);
      assertTripPlanQualityWarnings(parsed.result.warnings);
      assertTripPlanValidatorQuality(parsed.result, request);
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
        plan: await enrichTripPlanWithRouteTravelTimes(
          enrichPlanWithSearchSources(enrichPlanLocationsFromPlaceHits(parsed.result, researchPlaceHits), webSearch.results, webSearch.warning),
        ),
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
        plan: await enrichTripPlanWithRouteTravelTimes(
          enrichPlanWithSearchSources(enrichPlanLocationsFromPlaceHits(fallback, researchPlaceHits), webSearch.results, webSearch.warning),
        ),
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
  aiContext?: AIContextBuildResult | null;
}): Promise<ChatResponsePayload> {
  const travelAgentDecision = decideTravelAgentMode({
    message: input.message,
    context: input.context,
    tripProfile: input.tripProfile,
    aiContext: input.aiContext,
    memoryContext: input.memoryContext,
  });

  if (
    travelAgentDecision.mode === "casual_chat" ||
    travelAgentDecision.mode === "collect_requirements" ||
    travelAgentDecision.mode === "confirm_preferences"
  ) {
    return buildNaturalTravelAgentResponse(travelAgentDecision);
  }

  const itineraryInquiryResponse = buildExistingItineraryInquiryResponse({
    message: input.message,
    context: input.context,
    questionAnswers: input.questionAnswers,
  });
  if (itineraryInquiryResponse) {
    return { ...itineraryInquiryResponse, travelAgentDecision };
  }

  const itineraryPatchResponse = await buildExistingItineraryPatchResponse({
    message: input.message,
    messages: input.messages,
    context: input.context,
    memoryContext: input.memoryContext,
    progressSessionId: input.progressSessionId,
  });
  if (itineraryPatchResponse) {
    return { ...itineraryPatchResponse, travelAgentDecision };
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
      return { ...structuredTripResponse, travelAgentDecision };
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

  const perRoundTimeout = Math.min(
    CHAT_COMPOSE_TIMEOUT_MS,
    serverConfig.ollamaTimeoutCapMs,
    Math.max(45_000, serverConfig.ollamaTimeoutMs),
  );

  const shouldResearch = travelAgentDecision.shouldSearch;
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
        format: travelResearchToolRequestJsonSchema,
        timeoutMs: perRoundTimeout,
        options: { temperature: 0, top_p: 0.9, num_ctx: 16_384 },
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
    const interestText = input.context?.preferences?.interests?.filter(Boolean).join(" ") || "";
    const webSearchQuery = [input.context?.destination || "", interestText, input.message]
      .filter(Boolean)
      .join(" ")
      .trim();
    webSearch = await runWebSearch(webSearchQuery, serverConfig.aiWebSearchMaxResults, input.progressSessionId, {
      decision: travelAgentDecision.searchDecision,
    });
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
        (webSearch.warning
          ? "我目前無法取得最新資料，但可以先根據既有資訊提供規劃方向。"
          : "我目前先根據已取得的資料整理建議，建議出發前再確認營業時間與交通資訊。")
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
  let raw: string;
  try {
    raw = await chatWithOllamaTimeoutRetry({
      task: "travel-chat",
      format: structuredChatOutputJsonSchema,
      timeoutMs: perRoundTimeout,
      options: { temperature: 0, top_p: 0.9, num_ctx: 16_384 },
      messages: [
        { role: "system", content: prompt.system },
        ...normalizeHistory(input.context, language),
        ...normalizeConversationHistory(input.messages),
        { role: "user", content: prompt.user },
      ],
    });
  } catch (error) {
    if (!(error instanceof OllamaRequestError)) {
      throw error;
    }
    if (!error.isTimeout) {
      throw error;
    }
    const fallbackText = buildTravelChatTimeoutFallbackText(digestText);
    publishProgressStep(input.progressSessionId, {
      phase: "compose",
      label: "生成回覆",
      detail: "模型回應逾時，已先回覆目前可用的整理結果。",
      status: "completed",
      provider: "ollama",
    });
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: fallbackText,
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        responseType: "text_message",
        sources:
          serverConfig.aiWebSearchRequireCitations && webSearch.results.length
            ? toCitationList(webSearch.results, 3)
            : undefined,
      },
      travelAgentDecision,
    };
  }

  const structured = parseStructuredChatOutput(raw);
  const proposedChanges = filterProposedChangesByVerifiedPlaces(
    structured.proposedChanges,
    digest.placeHits,
  );
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
    travelAgentDecision,
  };
}
