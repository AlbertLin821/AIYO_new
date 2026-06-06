import { isPreferenceOverrideMessage } from "@/lib/personalization/preferenceDisplay";
import { filterProposedChangesByVerifiedPlaces } from "@/server/ai/placeNameMatch";
import { normalizeConversationHistory } from "@/server/services/travelPlanner/chatConversation";
import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { chatWithOllama, OllamaRequestError, type OllamaMessage } from "@/server/ai/ollamaClient";
import { chatWithOpenWebUI } from "@/server/ai/openWebUiClient";
import { decideTravelAgentMode } from "@/server/ai/travelAgentOrchestrator";
import {
  chatPlanningOutputJsonSchema,
  questionCardJsonSchema,
  travelResearchToolRequestJsonSchema,
  tripPlanResultJsonSchema,
} from "@/server/ai/schemas/travelPlanningSchemas";
import { buildQuestionCardDesignerSystemPrompt } from "@/server/ai/policies/travelPlanningPolicy";
import { sanitizeDynamicQuestionCard } from "@/server/ai/validators/questionCardValidator";
import {
  validateTravelPlanResponseQuality,
} from "@/server/ai/validators/travelPlanValidator";
import {
  buildChatPrompt,
  buildChatResearchPlanningPrompt,
  buildItineraryPatchIntentPrompt,
  buildItineraryPrompt,
  buildMapPlanningPrompt,
  buildPersonalMemoryRecallPrompt,
  detectResponseLanguage,
} from "@/server/ai/promptBuilder";
import { serverConfig } from "@/server/config";
import {
  decideSearchIntent,
  formatTravelSearchContextForPrompt,
  toTravelSearchContext,
} from "@/server/search/searchIntent";
import { runUnifiedWebSearch, type WebSearchBackend } from "@/server/search/webSearchService";
import type { WebSearchResult } from "@/server/search/webSearchTypes";
import { mergeChatSources, normalizeWebSearchSources, pickCitationIdsForText } from "@/server/chat/sourceNormalization";
import { registerChatSources } from "@/server/chat/sourcePreviewStore";
import { publishChatProgress } from "@/server/chat/chatProgressStore";
import { applyRevisionInstructionToProfile } from "@/server/chat/tripRevision";
import { enrichTripPlanWithRouteTravelTimes } from "@/server/geo/routeTravelTimeService";
import { runStructuredTripWorkflow } from "@/server/services/travelPlanningWorkflowService";
import {
  INSUFFICIENT_RESEARCH_WARNING,
  INSUFFICIENT_RESEARCH_TRAVEL_PLAN_WARNING,
  getDayItemCountBounds,
  suggestedMealTime,
} from "@/server/ai/planning/itineraryPlanningStandard";
import { validateItineraryQuality } from "@/server/ai/planning/itineraryQualityValidator";
import { buildTripPlanResearchPlan } from "@/server/ai/planning/tripPlanResearchPolicy";
import {
  buildDefaultTravelToolRequests,
  executeTravelToolRequests,
  parseTravelToolRequestsFromModel,
} from "@/server/services/travelResearchTools";
import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import {
  parseChatPlanningOutput,
  parseTripPlanResponse,
  StructuredOutputError,
} from "@/server/ai/responseParser";
import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import {
  enrichChatContextWithDestinationScope,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import { resolveTripDestinationScopeWithGeocode } from "@/server/places/resolveTripDestinationScope";
import { extractDestinationFromPlanningText, inferPlanningUpdateFromTexts } from "@/lib/tripPlanningSignals";
import { filterTripPlanByDestinationScope } from "@/server/services/filterTripPlanByDestinationScope";
import {
  mergeAssistantActionsWithLegacy,
} from "@/lib/assistantActions/converters";
import { validateAssistantActions } from "@/server/ai/assistantActionValidator";
import {
  buildPersonalMemoryBundle,
  formatPersonalMemoryBundleForPrompt,
  formatPersonalMemoryDeterministicReply,
  isPersonalMemoryRecallIntent,
} from "@/server/memory/personalMemoryRecall";
import type {
  AiProposedChange,
  AssistantAction,
  AssistantActionItemInput,
  ChatPlanningOutput,
  ChatContext,
  ChatMessage,
  ChatQuestion,
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
  TripPlanItem,
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
      preferenceConfirmation: decision.preferenceConfirmation,
      proposedChanges: [],
    },
    proposedChanges: [],
    travelAgentDecision: decision,
  };
}

function collectConversationTexts(input: {
  message?: string;
  messages?: ChatMessage[];
  extraTexts?: string[];
}): string[] {
  const texts: string[] = [];
  for (const item of input.messages?.slice(-12) ?? []) {
    if (item.content?.trim()) {
      texts.push(item.content);
    }
  }
  if (input.message?.trim()) {
    texts.push(input.message);
  }
  for (const chunk of input.extraTexts ?? []) {
    if (chunk?.trim()) {
      texts.push(chunk);
    }
  }
  return texts;
}

function stripRedundantFollowUpPrompts(content: string): string {
  return content
    .replace(/\n*📋\s*還需要確認[^\n]*\n(?:\s*[-*•].+\n?)+/gu, "")
    .replace(/\n*你比較想體驗哪種類型[^?\n]*\?[^\n]*\n?/gu, "")
    .replace(/\n*另外[，,]?\s*預計停留幾天[^?\n]*\?[^\n]*\n?/gu, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function contextHasItineraryItems(context?: ChatContext): boolean {
  return Boolean(context?.itinerary?.some((day) => day.items.length > 0));
}

function buildGuidedTravelAgentResponse(
  decision: TravelAgentDecision,
  input: {
    tripProfile?: TripProfile;
    context?: ChatContext;
    message?: string;
    messages?: ChatMessage[];
  },
): ChatResponsePayload {
  const content =
    decision.userFacingGuidance ||
    decision.preferenceConfirmation?.prompt ||
    "我可以先幫你整理旅遊方向，再依你的偏好排成可執行的行程。";
  const mergedProfile = mergeTripProfileWithContext(input.tripProfile, input.context, {
    message: input.message,
    messages: input.messages,
  });

  if (decision.mode === "confirm_preferences") {
    return {
      ...buildNaturalTravelAgentResponse(decision),
      tripProfile: mergedProfile,
    };
  }

  const followUpCard = buildQuestionCard(mergedProfile, input.context);

  if (!followUpCard) {
    return {
      ...buildNaturalTravelAgentResponse(decision),
      tripProfile: mergedProfile,
    };
  }

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: stripRedundantFollowUpPrompts(content),
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      responseType: "question_card",
      questionCard: followUpCard,
      tripProfile: mergedProfile,
      proposedChanges: [],
    },
    tripProfile: mergedProfile,
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

function normalizeAssistantAction(value: unknown): AssistantAction | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const type = String((value as { type?: unknown }).type || "").trim();
  if (!type.includes(".")) {
    return null;
  }
  return value as AssistantAction;
}

function parseStructuredChatOutput(raw: string): ChatPlanningOutput {
  try {
    const parsed = parseChatPlanningOutput(raw);
    return {
      ...parsed,
      replyText: sanitizeAssistantReply(parsed.replyText) || parsed.replyText,
    };
  } catch {
    const extracted = extractJsonObject(raw);
    const extractedReplyText =
      extracted && typeof extracted.replyText === "string"
        ? sanitizeAssistantReply(extracted.replyText) || extracted.replyText.trim()
        : "";
    return {
      mode: "answer_question",
      replyText: extractedReplyText || sanitizeAssistantReply(raw) || raw.trim() || "暫時無法產生有用的回覆。",
      itinerary: null,
      assistantActions: [],
      proposedChanges: [],
    };
  }
}

function validatedAssistantPayload(input: {
  assistantActions?: AssistantAction[];
  proposedChanges?: AiProposedChange[];
  aiContext?: AIContextBuildResult | null;
}): { assistantActions: AssistantAction[]; proposedChanges: AiProposedChange[] } {
  const merged = mergeAssistantActionsWithLegacy({
    assistantActions: input.assistantActions,
    proposedChanges: input.proposedChanges,
  });
  if (!input.aiContext?.structuredContext || !merged.assistantActions.length) {
    return merged;
  }
  const validation = validateAssistantActions({
    userId: input.aiContext.structuredContext.userId,
    tripId: input.aiContext.structuredContext.currentTrip?.id,
    actions: merged.assistantActions,
    structuredContext: input.aiContext.structuredContext,
  });
  return {
    assistantActions: validation.validActions,
    // Legacy compatibility only: keep original proposedChanges if they were supplied.
    proposedChanges: merged.proposedChanges,
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

const TRIP_PLAN_COMPOSE_TIMEOUT_MS = 60_000;

function resolveOllamaRoundTimeoutMs(): number {
  const floor = 45_000;
  const fromEnv = Math.max(floor, serverConfig.ollamaTimeoutMs);
  return Math.min(serverConfig.ollamaTimeoutCapMs, fromEnv);
}
const PATCH_INTENT_TIMEOUT_MS = 30_000;
const PERSONAL_MEMORY_RECALL_TIMEOUT_MS = 45_000;
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

function buildTravelChatTimeoutFallbackText(
  digestText: string,
  options?: {
    message?: string;
    aiContext?: AIContextBuildResult | null;
    memoryContext?: string;
    mem0Memories?: string[];
    tripProfile?: TripProfile | null;
  },
): string {
  const normalized = digestText.trim();
  if (normalized) {
    return normalized;
  }
  if (options?.message && isPersonalMemoryRecallIntent(options.message)) {
    const bundle = buildPersonalMemoryBundle({
      aiContext: options.aiContext,
      memoryContext: options.memoryContext,
      mem0Memories: options.mem0Memories,
      tripProfile: options.tripProfile,
    });
    if (bundle.hasData) {
      return formatPersonalMemoryDeterministicReply(bundle, options.message);
    }
  }
  return TRAVEL_CHAT_TIMEOUT_FALLBACK;
}

async function buildPersonalMemoryRecallResponse(input: {
  message: string;
  aiContext?: AIContextBuildResult | null;
  memoryContext?: string;
  mem0Memories?: string[];
  tripProfile?: TripProfile;
  progressSessionId?: string;
  travelAgentDecision: TravelAgentDecision;
}): Promise<ChatResponsePayload> {
  const bundle = buildPersonalMemoryBundle({
    aiContext: input.aiContext,
    memoryContext: input.memoryContext,
    mem0Memories: input.mem0Memories,
    tripProfile: input.tripProfile,
  });

  if (!bundle.hasData) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: formatPersonalMemoryDeterministicReply(bundle, input.message),
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        responseType: "text_message",
      },
      travelAgentDecision: input.travelAgentDecision,
    };
  }

  const memoryDigest = formatPersonalMemoryBundleForPrompt(bundle);
  const prompt = buildPersonalMemoryRecallPrompt(input.message, memoryDigest);
  const recallTimeout = Math.min(
    PERSONAL_MEMORY_RECALL_TIMEOUT_MS,
    serverConfig.ollamaTimeoutCapMs,
    Math.max(30_000, serverConfig.ollamaTimeoutMs),
  );

  let content: string;
  try {
    const raw = await chatWithOllama({
      task: "travel-chat",
      timeoutMs: recallTimeout,
      options: { temperature: 0.2, top_p: 0.9, num_ctx: 8192 },
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
    });
    content = raw.trim() || formatPersonalMemoryDeterministicReply(bundle, input.message);
  } catch (error) {
    if (!(error instanceof OllamaRequestError) || !error.isTimeout) {
      throw error;
    }
    content = formatPersonalMemoryDeterministicReply(bundle, input.message);
  }

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
    },
    travelAgentDecision: input.travelAgentDecision,
  };
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

async function chatWithOpenWebUiTimeoutRetry(
  request: Parameters<typeof chatWithOpenWebUI>[0],
): Promise<string> {
  const retryCount = Math.max(0, serverConfig.ollamaTimeoutRetryCount);
  const retryDelayMs = Math.max(0, serverConfig.ollamaTimeoutRetryDelayMs);
  const maxAttempts = 1 + retryCount;
  let lastTimeoutError: OllamaRequestError | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await chatWithOpenWebUI(request);
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

  throw lastTimeoutError ?? new OllamaRequestError("Open WebUI request timed out", undefined, "timeout");
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
  两: 2,
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
    message.match(/^([^，。,\s]{2,12})(?:旅遊|旅行|自由行|行程)/u)?.[1] ||
    extractDestinationFromPlanningText(message);
  if (
    destination &&
    !/哪裡|哪邊|幾天|多久/u.test(destination) &&
    isPlausibleDestinationLabel(destination)
  ) {
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
      case "traveler_count": {
        const count = parseFlexibleNumber(first);
        if (count && count > 0) {
          const companionProfile = classifyCompanionsFromTravelerCount(count);
          next.traveler_count = companionProfile.travelerCount;
          next.companions = companionProfile.companions;
        }
        break;
      }
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

function isPlausibleDestinationLabel(label: string): boolean {
  const trimmed = label.trim();
  if (!trimmed || trimmed.length < 2) {
    return false;
  }
  if (/[？?：:（）()]/.test(trimmed)) {
    return false;
  }
  if (/^(兩人|一人|三人|四人|五人|伴侶|朋友|家人|情侶)/u.test(trimmed)) {
    return false;
  }
  return true;
}

function mergeTripProfileWithContext(
  profile: TripProfile | undefined,
  context?: ChatContext,
  options?: {
    message?: string;
    messages?: ChatMessage[];
    replyText?: string;
  },
): TripProfile {
  const base = normalizeTripProfile(profile ?? emptyTripProfile());
  const daysFromContext =
    typeof context?.days === "number" && Number.isFinite(context.days) && context.days > 0
      ? Math.round(context.days)
      : null;
  const destinationFromContext = context?.destination?.trim()
    ? normalizeDestinationLabel(context.destination)
    : null;
  const inferred = inferPlanningUpdateFromTexts(
    collectConversationTexts({
      message: options?.message,
      messages: options?.messages,
      extraTexts: options?.replyText ? [options.replyText] : undefined,
    }),
  );
  const messageInferred = options?.message
    ? inferPlanningUpdateFromTexts([options.message])
    : ({} as ReturnType<typeof inferPlanningUpdateFromTexts>);
  const activeDestination =
    messageInferred.destination && isPlausibleDestinationLabel(messageInferred.destination)
      ? normalizeDestinationLabel(messageInferred.destination)
      : inferred.destination && isPlausibleDestinationLabel(inferred.destination)
        ? normalizeDestinationLabel(inferred.destination)
        : null;

  const conversationTexts = collectConversationTexts({
    message: options?.message,
    messages: options?.messages,
    extraTexts: options?.replyText ? [options.replyText] : undefined,
  });
  let fromConversation = base;
  for (const text of conversationTexts) {
    fromConversation = updateTripProfileFromText(fromConversation, text);
  }

  return normalizeTripProfile({
    ...fromConversation,
    destination:
      activeDestination ||
      fromConversation.destination ||
      base.destination ||
      destinationFromContext ||
      null,
    duration_days:
      messageInferred.days ??
      fromConversation.duration_days ??
      base.duration_days ??
      daysFromContext ??
      inferred.days ??
      null,
  });
}

export function buildQuestionCard(profile: TripProfile, context?: ChatContext): QuestionCardPayload | null {
  const merged = mergeTripProfileWithContext(profile, context);
  const destination = normalizeDestinationLabel(merged.destination || "這次");
  const questions: ChatQuestion[] = [];

  if (!merged.destination) {
    questions.push({
      slot: "destination",
      question: "你想去哪個目的地？",
      type: "text",
      placeholder: "例如：熊本、福岡、東京",
    });
  }

  if (!merged.duration_days) {
    questions.push({
      slot: "duration_days",
      question: merged.destination ? `這趟${destination}預計玩幾天？` : "你預計玩幾天？",
      type: "single_choice",
      options: [
        { label: "1 天", value: "1" },
        { label: "2–3 天", value: "3", recommended: true },
        { label: "4–5 天", value: "5" },
        { label: "6 天以上", value: "7" },
      ],
      helperText: "選最接近的選項即可，之後還能再調整。",
    });
  }

  if (!merged.travel_dates) {
    questions.push({
      slot: "travel_dates",
      question: merged.destination ? `${destination}預計哪幾天出發？` : "你預計哪幾天出發？",
      type: "date_range",
      startLabel: "出發日期",
      endLabel: "回程日期",
      helperText: "如果日期還沒完全確定，也可以先選一個大概區間。",
    });
  }

  if (!merged.traveler_count && !merged.companions) {
    questions.push({
      slot: "traveler_count",
      question: "這次大概幾個人同行？",
      type: "single_choice",
      options: [
        { label: "1 人", value: "1" },
        { label: "2 人", value: "2", recommended: true },
        { label: "3–4 人", value: "4" },
        { label: "5 人以上", value: "5" },
      ],
      helperText: "我會依人數調整交通、用餐和節奏建議。",
    });
  }

  const trimmed = questions.slice(0, 4);
  if (!trimmed.length) {
    return null;
  }

  return {
    response_type: "question_card",
    title: merged.destination ? `再確認一下${destination}行程偏好` : "先確認行程的基本條件",
    description: "選好後我會依你的偏好繼續規劃。",
    questions: trimmed,
    action: { label: "送出並繼續", shortcut: "Enter" },
  };
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
  if (input.questionAnswers?.length) {
    return false;
  }

  const message = input.message.trim();
  const isMutatingRequest =
    /新增|加入|加上|刪除|刪掉|移除|修改|調整|改成|套用|儲存|建立|創建|產生|重新規劃|幫我(?:安排|規劃|新增|加入|調整|修改|刪除|刪掉|移除)|請(?:安排|規劃|新增|加入|調整|修改|刪除|刪掉|移除)/u.test(message);
  if (isMutatingRequest) {
    return false;
  }

  return /(?:這個|目前|現在|我的)?行程(?:裡面|裡|內)?(?:有(?:哪些|什麼|甚麼)|包含|內容|活動|景點|地點|安排)|有(?:哪些|什麼|甚麼)(?:活動|景點|地點|安排)|第[一二兩三四五六七八九十\d]+天(?:有(?:哪些|什麼|甚麼)|安排|活動|景點|地點|午餐|晚餐)|列出(?:這個|目前|我的)?行程|第[一二兩三四五六七八九十\d]+天.*?(?:會不會太趕|太趕|太鬆|太鬆散|要不要調整)|(?:第一|第1)天.*?(?:午餐|晚餐).*(?:吃什麼|是什麼)/u.test(message);
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
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: "目前還沒有可參考的行程內容，所以我無法回答這個行程問題。你可以先讓我產生一份行程，或先告訴我想看的天數與地點。",
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
        assistantActions: [],
        proposedChanges: [],
      },
      assistantActions: [],
      proposedChanges: [],
    };
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
  const message = input.message.trim();
  if (isPreferenceOverrideMessage(message)) {
    return false;
  }
  if (/(?:地圖|地图).{0,12}(?:定位到|移到|顯示|聚焦)/u.test(input.message)) {
    return true;
  }
  if (parseTripDurationExtensionRequest(message) && hasCurrentTripDurationContext(input.context)) {
    return true;
  }
  if (parseTripDurationReductionRequest(message) && hasCurrentTripDurationContext(input.context)) {
    return true;
  }
  if (!input.context?.itinerary?.length) {
    return false;
  }
  const mutatesCurrentItinerary =
    /新增|加入|加上|加到|加(?:一個|個)?|刪除|刪掉|移除|取消|去掉|修改|調整|改成|換成|改到|提前|延後|移到/u.test(message) ||
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

function parseTripDurationExtensionRequest(message: string): number | null {
  const match =
    message.match(/(?:再)?(?:多加|增加|加|延長|延伸)\s*(\d+|[一二兩两三四五六七八九十])?\s*天/u) ||
    message.match(/(?:多|加)(一|1)\s*天/u);
  if (!match) {
    return null;
  }
  const increment = parsePatchDayNumber(match[1] || "一");
  return increment && increment > 0 ? increment : 1;
}

function getCurrentTripDayCount(context?: ChatContext): number {
  const explicitDays = typeof context?.days === "number" && Number.isFinite(context.days) ? Math.floor(context.days) : 0;
  const itineraryDays = context?.itinerary?.length || 0;
  const maxItineraryDay = Math.max(0, ...(context?.itinerary || []).map((day) => day.dayNumber || 0));
  return Math.max(explicitDays, itineraryDays, maxItineraryDay);
}

function hasCurrentTripDurationContext(context?: ChatContext): boolean {
  return Boolean(context?.destination || getCurrentTripDayCount(context) > 0);
}

function buildTripDurationExtensionPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const increment = parseTripDurationExtensionRequest(input.message);
  if (!increment || !hasCurrentTripDurationContext(input.context)) {
    return null;
  }
  const currentDays = Math.max(1, getCurrentTripDayCount(input.context) || 1);
  const targetDays = Math.min(30, currentDays + increment);
  if (targetDays <= currentDays) {
    return null;
  }
  const assistantActions: AssistantAction[] = [
    {
      type: "trip.update_metadata",
      payload: { days: targetDays },
    },
  ];
  const addedText = increment === 1 ? "1 天" : `${increment} 天`;
  const destinationText = input.context?.destination ? `${input.context.destination} ` : "";
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `可以，我已幫你把${destinationText}行程從 ${currentDays} 天延長為 ${targetDays} 天，新增的 ${addedText} 會先保留空白，不會重排前面已安排的內容。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      assistantActions,
    },
    assistantActions,
    proposedChanges: [],
  };
}

function parseTripDurationReductionRequest(message: string): number | null {
  const match =
    message.match(/(?:少|減少|减少|縮短|缩短)\s*(\d+|[一二兩两三四五六七八九十])?\s*天/u) ||
    message.match(/(?:少|減)(一|1)\s*天/u);
  if (!match) {
    return null;
  }
  const decrement = parsePatchDayNumber(match[1] || "一");
  return decrement && decrement > 0 ? decrement : 1;
}

function buildTripDurationReductionPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const decrement = parseTripDurationReductionRequest(input.message);
  if (!decrement || !hasCurrentTripDurationContext(input.context)) {
    return null;
  }
  const currentDays = Math.max(1, getCurrentTripDayCount(input.context) || 1);
  const targetDays = Math.max(1, currentDays - decrement);
  if (targetDays >= currentDays) {
    return null;
  }
  const assistantActions: AssistantAction[] = [
    {
      type: "trip.update_metadata",
      payload: { days: targetDays },
    },
  ];
  const removedText = currentDays - targetDays === 1 ? "1 天" : `${currentDays - targetDays} 天`;
  const destinationText = input.context?.destination ? `${input.context.destination} ` : "";
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `可以，我已幫你把${destinationText}行程從 ${currentDays} 天縮短為 ${targetDays} 天，會移除最後的 ${removedText}，前面已安排的內容會保留。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      assistantActions,
    },
    assistantActions,
    proposedChanges: [],
  };
}

function normalizePatchTime(raw: string | undefined): string | null {
  const value = (raw || "").trim().replace("：", ":");
  const direct = value.match(/^([01]?\d|2[0-3]):([0-5]\d)$/u);
  if (direct) {
    return `${direct[1].padStart(2, "0")}:${direct[2]}`;
  }
  const meridiem = value.match(/^(上午|早上|下午|晚上)\s*(\d{1,2})(?:點|:)(?:(\d{1,2})分?)?$/u);
  if (!meridiem) {
    return null;
  }
  let hour = Number(meridiem[2]);
  const minute = Number(meridiem[3] || 0);
  if (minute > 59 || hour < 0 || hour > 12) {
    return null;
  }
  if ((meridiem[1] === "下午" || meridiem[1] === "晚上") && hour < 12) {
    hour += 12;
  }
  if ((meridiem[1] === "上午" || meridiem[1] === "早上") && hour === 12) {
    hour = 0;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function buildTimeUpdatePatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const match =
    input.message.match(
      new RegExp(
        `(?:把)?${DAY_PREFIX_PATTERN}(?:的)?\\s*([^\\n，。,]+?)\\s*(?:時間)?(?:改到|改成|改為|調整到|提前到|延後到)\\s*([0-2]?\\d[:：][0-5]\\d|(?:上午|早上|下午|晚上)\\s*\\d{1,2}(?:點|:)\\d{0,2}(?:分)?)`,
        "u",
      ),
    ) ||
    input.message.match(
      /(?:把)?([^\n，。,]+?)\s*(?:時間)?(?:改到|改成|改為|調整到|提前到|延後到)\s*([0-2]?\d[:：][0-5]\d|(?:上午|早上|下午|晚上)\s*\d{1,2}(?:點|:)\d{0,2}(?:分)?)/u,
    );
  if (!match || !input.context?.itinerary?.length) {
    return null;
  }
  const hasExplicitDay = match.length >= 4;
  const day = hasExplicitDay ? parsePatchDayNumber(match[1]) : null;
  const title = cleanupPatchTitle(hasExplicitDay ? match[2] : match[1]).replace(/時間$/u, "").trim();
  const startTime = normalizePatchTime(hasExplicitDay ? match[3] : match[2]);
  if (!title || !startTime) {
    return null;
  }
  const target = matchItineraryItemFromContext({ context: input.context, title, day });
  if (!target) {
    return null;
  }
  const assistantActions: AssistantAction[] = [
    {
      type: "itinerary.update_item",
      payload: {
        dayId: `day-${target.dayNumber}`,
        itemId: target.item.id,
        patch: { startTime },
      },
    },
  ];
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `可以，我會把第 ${target.dayNumber} 天「${target.item.title}」的時間調整為 ${startTime}。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      assistantActions,
    },
    assistantActions,
    proposedChanges: [],
  };
}

function buildTransportUpdatePatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const match =
    input.message.match(
      new RegExp(
        `(?:把)?${DAY_PREFIX_PATTERN}(?:的)?\\s*(?:[^\\n，。,]{1,40}?到)?\\s*([^\\n，。,]+?)\\s*(?:的)?交通(?:方式)?(?:改成|改為|換成|調整成)\\s*([^\\n，。,]+)`,
        "u",
      ),
    ) ||
    input.message.match(
      /(?:把)?(?:[^\n，。,]{1,40}?到)?\s*([^\n，。,]+?)\s*(?:的)?交通(?:方式)?(?:改成|改為|換成|調整成)\s*([^\n，。,]+)/u,
    );
  if (!match || !input.context?.itinerary?.length) {
    return null;
  }
  const hasExplicitDay = match.length >= 4;
  const day = hasExplicitDay ? parsePatchDayNumber(match[1]) : null;
  const title = cleanupPatchTitle(hasExplicitDay ? match[2] : match[1]);
  const transport = cleanupPatchTitle(hasExplicitDay ? match[3] : match[2]);
  if (!title || !transport) {
    return null;
  }
  const target = matchItineraryItemFromContext({ context: input.context, title, day });
  if (!target) {
    return null;
  }
  const assistantActions: AssistantAction[] = [
    {
      type: "itinerary.update_item",
      payload: {
        dayId: `day-${target.dayNumber}`,
        itemId: target.item.id,
        patch: { transport },
      },
    },
  ];
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `可以，我會把第 ${target.dayNumber} 天「${target.item.title}」的交通方式調整為「${transport}」。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      assistantActions,
    },
    assistantActions,
    proposedChanges: [],
  };
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

function parseMoveItineraryItemRequest(
  message: string,
): { fromDay: number; toDay: number; title: string } | null {
  const fromToDayPattern = new RegExp(
    `(?:把)?\\s*(.+?)\\s*從\\s*${DAY_PREFIX_PATTERN}\\s*移到\\s*${DAY_PREFIX_PATTERN}`,
    "u",
  );
  const fromTitleToDayPattern = new RegExp(
    `(?:把)?\\s*${DAY_PREFIX_PATTERN}(?:的)?\\s*(.+?)\\s*移到\\s*${DAY_PREFIX_PATTERN}`,
    "u",
  );

  const fromToMatch = message.match(fromToDayPattern);
  if (fromToMatch?.[1] && fromToMatch[2] && fromToMatch[3]) {
    const title = cleanupPatchTitle(fromToMatch[1]);
    const fromDay = parsePatchDayNumber(fromToMatch[2]);
    const toDay = parsePatchDayNumber(fromToMatch[3]);
    if (title && fromDay && toDay && fromDay !== toDay) {
      return { fromDay, toDay, title };
    }
  }

  const fromTitleMatch = message.match(fromTitleToDayPattern);
  if (fromTitleMatch?.[1] && fromTitleMatch[2] && fromTitleMatch[3]) {
    const fromDay = parsePatchDayNumber(fromTitleMatch[1]);
    const title = cleanupPatchTitle(fromTitleMatch[2]);
    const toDay = parsePatchDayNumber(fromTitleMatch[3]);
    if (title && fromDay && toDay && fromDay !== toDay) {
      return { fromDay, toDay, title };
    }
  }

  return null;
}

function tripPlanItemToAssistantActionInput(item: TripPlanItem): AssistantActionItemInput {
  const category =
    item.type === "restaurant"
      ? "restaurant"
      : item.type === "hotel"
        ? "hotel"
        : item.type === "transport"
          ? "transport"
          : "attraction";
  return {
    title: item.title,
    location: item.location?.name || item.title,
    address: item.location?.address || null,
    startTime: item.time,
    notes: item.notes || null,
    category,
    transport: item.transport || null,
    lat: item.location?.lat ?? null,
    lng: item.location?.lng ?? null,
    source: item.source === "video" ? "video" : item.source === "manual" ? "manual" : "assistant",
  };
}

function buildMoveItineraryItemPatchResponse(input: {
  message: string;
  context?: ChatContext;
}): ChatResponsePayload | null {
  const parsed = parseMoveItineraryItemRequest(input.message);
  if (!parsed || !input.context?.itinerary?.length) {
    return null;
  }

  const target = matchItineraryItemFromContext({
    context: input.context,
    day: parsed.fromDay,
    title: parsed.title,
  });
  if (!target) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `第 ${parsed.fromDay} 天找不到「${parsed.title}」。請確認天數或景點名稱是否正確。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  if (target.dayNumber === parsed.toDay) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `「${target.item.title}」本來就在第 ${parsed.toDay} 天，不需要移動。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
      },
    };
  }

  const targetDayExists = input.context.itinerary.some((day) => day.dayNumber === parsed.toDay);
  const requiredDayCount = Math.max(
    parsed.toDay,
    getCurrentTripDayCount(input.context),
    ...input.context.itinerary.map((day) => day.dayNumber),
  );
  const assistantActions: AssistantAction[] = [];

  if (!targetDayExists) {
    assistantActions.push({
      type: "trip.update_metadata",
      payload: { days: requiredDayCount },
    });
  }

  assistantActions.push(
    {
      type: "itinerary.remove_item",
      payload: {
        dayId: `day-${parsed.fromDay}`,
        itemId: target.item.id,
      },
    },
    {
      type: "itinerary.add_item",
      payload: {
        dayId: `day-${parsed.toDay}`,
        item: tripPlanItemToAssistantActionInput(target.item),
      },
    },
  );

  const extensionPrefix = !targetDayExists ? `我會先新增第 ${parsed.toDay} 天，` : "";

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: `可以，${extensionPrefix}我會把第 ${parsed.fromDay} 天的「${target.item.title}」移到第 ${parsed.toDay} 天。`,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      assistantActions,
    },
    assistantActions,
    proposedChanges: [],
  };
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
      assistantActions: [
        {
          type: "itinerary.remove_item",
          payload: {
            dayId: `day-${target.dayNumber}`,
            itemId: target.item.id,
          },
        },
      ],
    },
    assistantActions: [
      {
        type: "itinerary.remove_item",
        payload: {
          dayId: `day-${target.dayNumber}`,
          itemId: target.item.id,
        },
      },
    ],
    proposedChanges: [],
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
  assistantActions?: AssistantAction[];
}): ChatResponsePayload {
  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: input.content,
      timestamp: nowChatTimestamp(),
      responseType: "text_message",
      proposedChanges: input.proposedChanges,
      assistantActions: input.assistantActions,
    },
    proposedChanges: input.proposedChanges,
    assistantActions: input.assistantActions,
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
  const message = input.message.trim();

  const mapFocusMatch = message.match(/(?:地圖|地图).{0,8}(?:定位到|移到|顯示|聚焦)\s*([^\n，。,]+?)(?:$|[，。,])/u);
  if (mapFocusMatch) {
    const placeName = cleanupPatchTitle(mapFocusMatch[1]);
    if (placeName) {
      const assistantActions: AssistantAction[] = [
        { type: "map.focus_location", payload: { placeName, zoom: 15 } },
      ];
      return {
        reply: {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: `可以，我會把地圖焦點移到「${placeName}」。`,
          timestamp: nowChatTimestamp(),
          responseType: "text_message",
          assistantActions,
        },
        assistantActions,
        proposedChanges: [],
      };
    }
  }

  const durationExtensionResponse = buildTripDurationExtensionPatchResponse({
    message,
    context: input.context,
  });
  if (durationExtensionResponse) {
    return durationExtensionResponse;
  }

  const durationReductionResponse = buildTripDurationReductionPatchResponse({
    message,
    context: input.context,
  });
  if (durationReductionResponse) {
    return durationReductionResponse;
  }

  if (!input.context?.itinerary?.length) {
    return null;
  }

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

  const moveItemResponse = buildMoveItineraryItemPatchResponse({
    message,
    context: input.context,
  });
  if (moveItemResponse) {
    return moveItemResponse;
  }

  const reorderMatch = message.match(
    /(?:把)?第\s*(\d+|[一二兩三四五六七八九十])\s*天(?:的)?順序(?:改成|調整成|改為|換成)\s*([^\n。]+?)(?:$|[。])/u,
  );
  if (reorderMatch) {
    const day = parsePatchDayNumber(reorderMatch[1]);
    const names = reorderMatch[2]
      .split(/[、,，]/)
      .map((value) => cleanupPatchTitle(value))
      .filter(Boolean);
    const targetDay = input.context.itinerary.find((entry) => entry.dayNumber === day);
    if (day && targetDay && names.length === targetDay.items.length) {
      const orderedItemIds = names.map((name) => {
        const item = targetDay.items.find((candidate) =>
          compactComparableText(candidate.title).includes(compactComparableText(name)),
        );
        return item?.id || "";
      });
      if (orderedItemIds.every(Boolean) && new Set(orderedItemIds).size === targetDay.items.length) {
        const assistantActions: AssistantAction[] = [
          {
            type: "itinerary.reorder_items",
            payload: { dayId: `day-${day}`, orderedItemIds },
          },
        ];
        return {
          reply: {
            id: `assistant_${Date.now()}`,
            role: "assistant",
            content: `可以，我會把第 ${day} 天順序調整為：${names.join("、")}。`,
            timestamp: nowChatTimestamp(),
            responseType: "text_message",
            assistantActions,
          },
          assistantActions,
          proposedChanges: [],
        };
      }
    }
  }

  const relaxedDayMatch = message.match(
    /(?:把)?第\s*(\d+|[一二兩三四五六七八九十])\s*天(?:改成|調整成|排)?(?:更)?輕鬆/u,
  );
  if (relaxedDayMatch) {
    const day = parsePatchDayNumber(relaxedDayMatch[1]);
    const targetDay = input.context.itinerary.find((entry) => entry.dayNumber === day);
    if (day && targetDay?.items.length) {
      const assistantActions: AssistantAction[] = targetDay.items.slice(0, 6).map((item) => ({
        type: "itinerary.update_item",
        payload: {
          dayId: `day-${day}`,
          itemId: item.id,
          patch: {
            notes: [item.notes, "AI 建議：這天調整為較輕鬆節奏，保留彈性休息與移動時間。"]
              .filter(Boolean)
              .join("\n"),
          },
        },
      }));
      return {
        reply: {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: `可以，我會把第 ${day} 天調整為較輕鬆的節奏，減少趕行程感並保留休息彈性。`,
          timestamp: nowChatTimestamp(),
          responseType: "text_message",
          assistantActions,
        },
        assistantActions,
        proposedChanges: [],
      };
    }
  }

  const timeUpdateResponse = buildTimeUpdatePatchResponse({
    message,
    context: input.context,
  });
  if (timeUpdateResponse) {
    return timeUpdateResponse;
  }

  const transportUpdateResponse = buildTransportUpdatePatchResponse({
    message,
    context: input.context,
  });
  if (transportUpdateResponse) {
    return transportUpdateResponse;
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
      // #region agent log
      if (process.env.AIYO_DEBUG_AGENT_LOG === "1") {
        fetch("http://127.0.0.1:7685/ingest/65560261-863b-4a32-a6ca-5302ff0f0ae4", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3cb8fb" },
          body: JSON.stringify({
            sessionId: "3cb8fb",
            runId: "pre-fix",
            hypothesisId: "H1",
            location: "travelPlannerService.ts:buildDeterministicItineraryPatchResponse",
            message: "replace match missed itinerary item",
            data: { originalTitle, nextTitle, day, messagePreview: message.slice(0, 120) },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      }
      // #endregion
      return buildItineraryPatchResponsePayload({
        content: day
          ? `我目前無法唯一確認第 ${day} 天要替換的「${originalTitle}」。請再告訴我更完整的景點名稱。`
          : `我目前無法唯一確認要替換的「${originalTitle}」。請再告訴我是哪一天的哪個景點。`,
        proposedChanges: [],
      });
    }
    const assistantActions: AssistantAction[] = [
      {
        type: "itinerary.update_item",
        payload: {
          dayId: `day-${target.dayNumber}`,
          itemId: target.item.id,
          patch: {
            title: nextTitle,
            location: nextTitle,
          },
        },
      },
    ];
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: `已將第 ${target.dayNumber} 天的「${target.item.title}」調整為「${nextTitle}」，其餘安排維持不變。`,
        timestamp: nowChatTimestamp(),
        responseType: "text_message",
        assistantActions,
      },
      assistantActions,
      proposedChanges: [],
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

  const addToDayMatch = message.match(
    /(?:幫我|請)?(?:把)?\s*([^\n，。,]+?)\s*(?:加到|加入|加上|新增到)\s*(?:第\s*)?(\d+|[一二兩三四五六七八九十])\s*天/u,
  );
  const addMatch = addToDayMatch
    ? [, addToDayMatch[2], addToDayMatch[1]]
    : message.match(
    /(?:在)?第\s*(\d+|[一二兩三四五六七八九十])\s*天(?:.*?)(?:加入|加上|新增|加)(?:一個|個)?\s*([^\n，。,]+?)(?:$|[，。,])/u,
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
        assistantActions: [
          {
            type: "itinerary.add_item",
            payload: {
              dayId: `day-${day}`,
              item: {
                title,
                location: title,
                startTime: "18:30",
                source: "assistant",
              },
            },
          },
        ],
      },
      assistantActions: [
        {
          type: "itinerary.add_item",
          payload: {
            dayId: `day-${day}`,
            item: {
              title,
              location: title,
              startTime: "18:30",
              source: "assistant",
            },
          },
        },
      ],
      proposedChanges: [],
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

function hasInsufficientVerifiedResearch(request: TripPlanRequest, placeHits: PlaceSearchHit[]): boolean {
  const usablePlaces = dedupePlaceHitsByName(placeHits.filter((place) => place.name.trim().length > 1 && isUsablePlaceHit(place)));
  return usablePlaces.length < request.days * 2;
}

function assertTripPlanValidatorQuality(
  plan: TripPlanResult,
  request: TripPlanRequest,
  options?: { researchPlaceHits?: PlaceSearchHit[]; destinationScope?: TripDestinationScope | null },
): void {
  const issues = validateItineraryQuality(plan, request, {
    researchInsufficient: options?.researchPlaceHits
      ? hasInsufficientVerifiedResearch(request, options.researchPlaceHits)
      : undefined,
    destinationScope: options?.destinationScope,
  });
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
    })),
    days: plan.days.map((day) => {
      const foodItems = day.items.filter((item) => item.type === "restaurant");
      const spotItems = day.items.filter((item) => item.type !== "restaurant");
      return {
        day: `Day ${day.dayNumber}`,
        theme: cleanDayThemeLabel(day.theme || day.summary || `第 ${day.dayNumber} 天`),
        transportation: buildDayTransportationTexts(day)
          .slice(0, 4)
          .map((text) => ({ text })),
        spots: spotItems.map((item) => ({
          name: item.title,
          feature: item.notes || "依照目前旅遊需求安排的停靠點",
        })),
        food_recommendations: foodItems.map((item) => ({
          name: item.title,
          description: item.notes || "依照目前旅遊需求安排的用餐建議",
        })),
        tips: uniqueStrings(day.items.map((item) => item.notes || "").filter(Boolean))
          .slice(0, 3)
          .map((text) => ({ text })),
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
  const destinationScope =
    resolveTripDestinationScope(input.request.destination) ||
    (await resolveTripDestinationScopeWithGeocode(input.request.destination));
  const scopedPlaceHits = input.researchPlaceHits.filter((place) =>
    isPlaceHitInDestinationScope(place, destinationScope),
  );
  const fallback = buildFallbackTripPlan(input.request, scopedPlaceHits);
  console.warn("[trip-plan] model_unavailable,fallback");
  publishProgressStep(input.progressSessionId, {
    phase: "compose",
    label: "整理每日路線與節奏",
    detail: "模型回應過久，已改用快速 fallback 行程完成輸出。",
    status: "completed",
    provider: "ollama",
  });
  const enrichedPlan = enrichPlanWithSearchSources(
    enrichPlanLocationsFromPlaceHits(fallback, scopedPlaceHits),
    input.webSearch.results,
    input.webSearch.warning,
  );
  const scopedPlan = await sanitizeTripPlanForDestination(
    enrichedPlan,
    input.request.destination,
    destinationScope,
    { throwOnRemoved: false },
  );
  return {
    plan: resetDayOpeningRouteMetadata(await enrichTripPlanWithRouteTravelTimes(scopedPlan)),
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
    loadSupplementarySources: async (profile, progressSessionId, generated, researchPlan) => {
      void generated;
      void researchPlan;
      const supplementaryWebBundle = await runWebSearch(
        [profile.destination || "", profile.preferences.join(" "), "行程 交通 美食"].filter(Boolean).join(" ").trim(),
        4,
        progressSessionId,
        { skipIntentGate: true },
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

  const durationExtensionPatch = buildTripDurationExtensionPatchResponse({
    message: input.message,
    context: input.context,
  });
  if (durationExtensionPatch) {
    return durationExtensionPatch;
  }

  const durationReductionPatch = buildTripDurationReductionPatchResponse({
    message: input.message,
    context: input.context,
  });
  if (durationReductionPatch) {
    return durationReductionPatch;
  }

  const moveItemPatch = buildMoveItineraryItemPatchResponse({
    message: input.message,
    context: input.context,
  });
  if (moveItemPatch) {
    return moveItemPatch;
  }

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "理解行程修改意圖",
    detail: "正在分析你想對目前行程做什麼。",
    status: "running",
  });

  let llmReplyText = "";
  let resolvedActions: AssistantAction[] = [];
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
        format: chatPlanningOutputJsonSchema,
        timeoutMs: PATCH_INTENT_TIMEOUT_MS,
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
      if (structured.mode === "modify_itinerary") {
        resolvedActions = structured.assistantActions;
      } else if (structured.mode === "answer_question") {
        return buildItineraryPatchResponsePayload({
          content: structured.replyText,
          proposedChanges: [],
          assistantActions: [],
        });
      }
    } catch {
      // Ollama unavailable — fall back to deterministic parsing below.
    }
  }

  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "理解行程修改意圖",
    detail: resolvedActions.length ? "已解析並對應可執行動作。" : "正在嘗試其他解析方式。",
    status: "completed",
  });

  if (resolvedActions.length) {
    return buildItineraryPatchResponsePayload({
      content: llmReplyText || "已整理成可執行的行程修改。",
      proposedChanges: [],
      assistantActions: resolvedActions,
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

function resetDayOpeningRouteMetadata(plan: TripPlanResult): TripPlanResult {
  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      items: day.items.map((item, index) =>
        index === 0
          ? {
              ...item,
              transport: "",
              transportDurationMinutes: undefined,
              transportDistanceMeters: undefined,
              transportDataSource: undefined,
            }
          : item,
      ),
    })),
  };
}

function isPlaceHitInDestinationScope(place: PlaceSearchHit, scope?: TripDestinationScope | null): boolean {
  if (!scope?.countryCodes.length) {
    return true;
  }
  if (scope.isCountryLevel) {
    const address = place.formattedAddress?.trim();
    return Boolean(address && isTextInTripDestinationScope(address, scope));
  }
  const text = [place.name, place.formattedAddress].filter(Boolean).join(" ");
  if (isTextInTripDestinationScope(text, scope)) {
    return true;
  }
  return false;
}

async function sanitizeTripPlanForDestination(
  plan: TripPlanResult,
  destination: string,
  scope?: TripDestinationScope | null,
  options?: { throwOnRemoved?: boolean },
): Promise<TripPlanResult> {
  const filtered = await filterTripPlanByDestinationScope(plan, destination, scope);
  if (filtered.removedCount > 0 && options?.throwOnRemoved !== false) {
    throw new StructuredOutputError("MODEL_OUTPUT_DESTINATION_SCOPE_VIOLATION");
  }
  return resetDayOpeningRouteMetadata(filtered.plan);
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

export function buildFallbackTripPlan(request: TripPlanRequest, placeHits: PlaceSearchHit[] = []): TripPlanResult {
  const destinationScope = resolveTripDestinationScope(request.destination);
  const chinese = isCjk(
    [request.destination, request.preferences.notes, request.preferences.interests.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const transportLabel = request.preferences.transportPreference || (chinese ? "大眾運輸" : "Public transit");
  const destLabel = request.destination.trim() || (chinese ? "目的地" : "destination");
  const mustVisit = request.preferences.mustVisit || [];
  const normalizedMustVisit = new Set(mustVisit.map((value) => value.trim().toLowerCase()).filter(Boolean));
  const validPlaces = dedupePlaceHitsByName(
    placeHits.filter(
      (place) =>
        place.name.trim().length > 1 &&
        isUsablePlaceHit(place) &&
        isPlaceHitInDestinationScope(place, destinationScope),
    ),
  );
  const restaurants = validPlaces.filter(isRestaurantLikePlace);
  const attractions = validPlaces.filter((place) => !isRestaurantLikePlace(place));
  const poiPool = dedupePlaceHitsByName([
    ...validPlaces.filter((place) => normalizedMustVisit.has(place.name.trim().toLowerCase())),
    ...attractions,
    ...restaurants,
  ]);
  const researchInsufficient = poiPool.length < request.days * 2;
  const summary = chinese
    ? researchInsufficient
      ? `${destLabel} ${request.days} 天基礎行程已建立（地點資料有限，建議再補充偏好）。`
      : `${destLabel} ${request.days} 天基礎行程已建立，可再依需求微調。`
    : researchInsufficient
      ? `Created a ${request.days}-day starter itinerary for ${destLabel} with limited place data.`
      : `Created a ${request.days}-day starter itinerary for ${destLabel}.`;

  const toLocation = (place: PlaceSearchHit | undefined, description: string) =>
    isUsablePlaceHit(place) ? placeHitToLocation(place, description) : undefined;

  const buildMealItem = (
    dayNumber: number,
    slot: "lunch" | "dinner",
    anchor: PlaceSearchHit | undefined,
    itemIndex: number,
  ): TripPlanItem => {
    const restaurant = restaurants[(dayNumber + itemIndex) % Math.max(1, restaurants.length)];
    const synthetic = !restaurant;
    const title = restaurant?.name || (chinese ? (slot === "lunch" ? "午餐" : "晚餐") : slot === "lunch" ? "Lunch" : "Dinner");
    const areaHint = anchor?.name || destLabel;
    return {
      id: `fallback_${dayNumber}_meal_${slot}`,
      dayNumber,
      time: suggestedMealTime(slot),
      title,
      type: "restaurant",
      transport: transportLabel,
      notes: chinese
        ? synthetic
          ? `於 ${areaHint} 一帶安排${slot === "lunch" ? "午餐" : "晚餐"}。`
          : `安排在 ${title} 用餐。`
        : synthetic
          ? `${slot === "lunch" ? "Lunch" : "Dinner"} near ${areaHint}.`
          : `Dine at ${title}.`,
      source: "ai",
      location: toLocation(restaurant, `${destLabel} ${slot}`),
    };
  };

  const days: TripPlanDay[] = Array.from({ length: request.days }, (_, index) => {
    const dayNumber = index + 1;
    const bounds = getDayItemCountBounds(dayNumber, request.days);
    const targetPoiCount = researchInsufficient
      ? Math.min(Math.max(1, Math.min(2, poiPool.length)), poiPool.length)
      : Math.max(bounds.min - 2, Math.min(bounds.max - 2, poiPool.length));
    const dayPois = pickUniquePlaces(poiPool, index * 2, targetPoiCount);
    const anchor = dayPois[0];
    const items: TripPlanItem[] = [];
    let itemCursor = 0;

    const pushPoi = (place: PlaceSearchHit, time: string, type: TripPlanItem["type"] = "attraction") => {
      itemCursor += 1;
      items.push({
        id: `fallback_${dayNumber}_${itemCursor}`,
        dayNumber,
        time,
        title: place.name,
        type,
        transport: itemCursor === 1 ? transportLabel : transportLabel,
        notes: chinese ? `安排停留 ${place.name}。` : `Visit ${place.name}.`,
        source: "ai",
        location: toLocation(place, `${destLabel} 建議停留點`),
      });
    };

    if (dayPois[0]) {
      pushPoi(dayPois[0], dayNumber === 1 ? "10:30" : "09:30");
    }

    const includeLunch =
      request.days === 1 ||
      dayNumber !== 1 ||
      (request.days !== 3 && dayNumber !== request.days);
    const includeDinner =
      request.days === 1 ||
      dayNumber !== request.days ||
      (request.days === 2 && dayNumber === 1);

    if (includeLunch) {
      items.push(buildMealItem(dayNumber, "lunch", anchor, itemCursor));
      itemCursor += 1;
    }
    if (dayPois[1]) {
      pushPoi(dayPois[1], "14:30", "activity");
    }
    if (dayPois[2] && dayNumber !== request.days) {
      pushPoi(dayPois[2], "16:30", "activity");
    }
    if (includeDinner) {
      items.push(buildMealItem(dayNumber, "dinner", anchor || dayPois[1], itemCursor));
    }

    const themeNames = dayPois.map((place) => place.name).filter(Boolean);
    const dayTheme = chinese
      ? cleanDayThemeLabel(themeNames[0] || `${destLabel} 當日行程`, true)
      : cleanDayThemeLabel(themeNames[0] || `${destLabel} daily plan`, false);

    return {
      dayNumber,
      theme: dayTheme,
      summary: chinese
        ? themeNames.length
          ? `第 ${dayNumber} 天以 ${themeNames.join("、")} 為主。`
          : `第 ${dayNumber} 天行程較精簡，建議補充想去的區域。`
        : themeNames.length
          ? `Day ${dayNumber} focuses on ${themeNames.join(", ")}.`
          : `Day ${dayNumber} is a lighter route pending more place data.`,
      items,
    };
  });

  const warnings = researchInsufficient
    ? [INSUFFICIENT_RESEARCH_TRAVEL_PLAN_WARNING, INSUFFICIENT_RESEARCH_WARNING]
    : [];

  return {
    summary,
    days,
    warnings,
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
  const researchPlan = buildTripPlanResearchPlan(request);
  const destinationScope =
    resolveTripDestinationScope(request.destination) ||
    (await resolveTripDestinationScopeWithGeocode(request.destination));
  const researchContext = {
    destination: request.destination,
    days: request.days,
    budget: request.budget,
    tripStartDate: request.tripStartDate,
    tripEndDate: request.tripEndDate,
    preferences: request.preferences,
    itinerary: request.itineraryDraft,
  };

  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢地點候選",
    detail: researchPlan.reason,
    status: "running",
  });

  const emptyDigest = { text: "", placeHits: [] as PlaceSearchHit[], sources: {} as Record<string, ChatSource> };
  const researchTasks: Promise<unknown>[] = [];
  if (researchPlan.shouldResearch && researchPlan.toolRequests.length) {
    researchTasks.push(
      executeTravelToolRequests(researchPlan.toolRequests, researchContext, progressSessionId),
    );
  } else {
    researchTasks.push(Promise.resolve(emptyDigest));
  }
  for (const query of researchPlan.webSearchQueries) {
    researchTasks.push(
      runWebSearch(query, serverConfig.aiWebSearchMaxResults, progressSessionId, { skipIntentGate: true }),
    );
  }

  const settled = await Promise.allSettled(researchTasks);
  const webSearchBundles: WebSearchBundle[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      console.warn("[trip-plan] research_failed", result.reason);
      continue;
    }
    const value = result.value;
    if (value && typeof value === "object" && "placeHits" in value) {
      const digest = value as typeof emptyDigest;
      externalResearch = [externalResearch, digest.text].filter(Boolean).join("\n\n").trim();
      researchSources = mergeChatSources(researchSources, digest.sources);
      researchPlaceHits = dedupePlaceHitsByName(
        [...researchPlaceHits, ...digest.placeHits].filter((place) =>
          isPlaceHitInDestinationScope(place, destinationScope),
        ),
      );
    } else if (value && typeof value === "object" && "digest" in value) {
      webSearchBundles.push(value as WebSearchBundle);
    }
  }

  const webSearch: WebSearchBundle = webSearchBundles.reduce<WebSearchBundle>(
    (acc, bundle) => ({
      digest: [acc.digest, bundle.digest].filter(Boolean).join("\n\n"),
      results: [...acc.results, ...bundle.results],
      warning: acc.warning || bundle.warning,
    }),
    { digest: "", results: [], warning: undefined },
  );
  if (webSearch.digest) {
    externalResearch = [externalResearch, webSearch.digest].filter(Boolean).join("\n\n").trim();
    researchSources = mergeChatSources(researchSources, normalizeWebSearchSources(webSearch.results));
  }

  publishProgressStep(progressSessionId, {
    phase: "research",
    label: "查詢地點候選",
    detail: "外部資料蒐集完成。",
    status: "completed",
  });

  const researchChars = (externalResearch + (webSearch.digest || "")).length;
  const composeNumCtx = researchChars > 12_000 ? 32_768 : 16_384;

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
    label: "生成行程",
    detail: "正在根據查詢結果安排每日動線。",
    status: "running",
    provider: "ollama",
  });
  try {
    raw = await chatWithOllama({
      format: tripPlanResultJsonSchema,
      task: "trip-plan",
      timeoutMs: TRIP_PLAN_COMPOSE_TIMEOUT_MS,
      options: { temperature: 0, top_p: 0.9, num_ctx: composeNumCtx },
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
    assertTripPlanValidatorQuality(parsed.result, request, {
      researchPlaceHits,
      destinationScope,
    });
    console.info(`[trip-plan] parse_mode=${parsed.diagnostics.parseMode} retry_count=${retryCount}`);
    publishProgressStep(progressSessionId, {
      phase: "compose",
      label: "驗證行程",
      detail: "每日動線整理完成。",
      status: "completed",
      provider: "ollama",
    });
    const scoped = await sanitizeTripPlanForDestination(
      enrichPlanWithSearchSources(
        enrichPlanLocationsFromPlaceHits(parsed.result, researchPlaceHits),
        webSearch.results,
        webSearch.warning,
      ),
      request.destination,
      destinationScope,
    );
    const composed = await enrichTripPlanWithRouteTravelTimes(scoped);
    return {
      plan: resetDayOpeningRouteMetadata(composed),
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
        options: { temperature: 0, top_p: 0.9, num_ctx: composeNumCtx },
        messages: [
          requestMessages[0],
          {
            role: "user",
            content: buildItineraryPrompt(request, memoryContext, {
              retryMode: "strict-format",
              retryReason:
                error.message === "MODEL_OUTPUT_JSON_MISSING"
                  ? "The previous reply did not contain any valid JSON object."
                  : "The previous reply did not match the required TripPlanResult schema.",
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
      assertTripPlanValidatorQuality(parsed.result, request, {
        researchPlaceHits,
        destinationScope,
      });
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
      const scopedRetry = await sanitizeTripPlanForDestination(
        enrichPlanWithSearchSources(
          enrichPlanLocationsFromPlaceHits(parsed.result, researchPlaceHits),
          webSearch.results,
          webSearch.warning,
        ),
        request.destination,
        destinationScope,
      );
      const composedRetry = await enrichTripPlanWithRouteTravelTimes(scopedRetry);
      return {
        plan: resetDayOpeningRouteMetadata(composedRetry),
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
      const scopedFallback = await sanitizeTripPlanForDestination(
        enrichPlanWithSearchSources(
          enrichPlanLocationsFromPlaceHits(fallback, researchPlaceHits),
          webSearch.results,
          webSearch.warning,
        ),
        request.destination,
        destinationScope,
        { throwOnRemoved: false },
      );
      const composedFallback = await enrichTripPlanWithRouteTravelTimes(scopedFallback);
      return {
        plan: resetDayOpeningRouteMetadata(composedFallback),
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

function contextWithoutItineraryForGeneralReply(
  context: ChatContext | undefined,
  _decision: TravelAgentDecision,
): ChatContext | undefined {
  return context;
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
  mem0Memories?: string[];
  forceStructuredRevision?: boolean;
  aiContext?: AIContextBuildResult | null;
}): Promise<ChatResponsePayload> {
  let resolvedTripProfile = mergeTripProfileWithContext(input.tripProfile, input.context, {
    message: input.questionAnswers?.length ? undefined : input.message,
    messages: input.messages,
  });
  if (input.questionAnswers?.length) {
    resolvedTripProfile = applyQuestionAnswers(resolvedTripProfile, input.questionAnswers);
  } else {
    resolvedTripProfile = updateTripProfileFromText(resolvedTripProfile, input.message);
  }
  const resolvedDestination = resolvedTripProfile.destination || input.context?.destination;
  let destinationScope = input.context?.destinationScope;
  if (resolvedDestination?.trim() && !destinationScope?.countryCodes?.length) {
    destinationScope =
      (await resolveTripDestinationScopeWithGeocode(resolvedDestination)) ?? destinationScope;
  }
  const context = enrichChatContextWithDestinationScope({
    ...input.context,
    destination: resolvedDestination,
    destinationScope,
  });

  const travelAgentDecision = decideTravelAgentMode({
    message: input.message,
    context,
    tripProfile: resolvedTripProfile,
    aiContext: input.aiContext,
    memoryContext: input.memoryContext,
  });
  // #region agent log
  if (process.env.AIYO_DEBUG_AGENT_LOG === "1") {
    fetch("http://127.0.0.1:7685/ingest/65560261-863b-4a32-a6ca-5302ff0f0ae4", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "3cb8fb" },
      body: JSON.stringify({
        sessionId: "3cb8fb",
        runId: "pre-fix",
        hypothesisId: "H1-H3",
        location: "travelPlannerService.ts:chatWithTravelAssistant",
        message: "travel agent decision",
        data: {
          messagePreview: input.message.slice(0, 120),
          mode: travelAgentDecision.mode,
          debugReason: travelAgentDecision.debugReason,
          hasItinerary: Boolean(context?.itinerary?.length),
          isPreferenceOverride: isPreferenceOverrideMessage(input.message),
          patchRequest: isExistingItineraryPatchRequest({ message: input.message, context }),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion
  const generalReplyContext = contextWithoutItineraryForGeneralReply(context, travelAgentDecision);
  const itineraryInquiryResponse = buildExistingItineraryInquiryResponse({
    message: input.message,
    context,
    questionAnswers: input.questionAnswers,
  });

  if (itineraryInquiryResponse) {
    return { ...itineraryInquiryResponse, travelAgentDecision };
  }

  const skipNaturalShortcut = Boolean(input.questionAnswers?.length) ||
    Boolean(input.structuredTravelPlanning && input.tripProfile);

  if (
    !skipNaturalShortcut &&
    (travelAgentDecision.mode === "casual_chat" ||
      travelAgentDecision.mode === "collect_requirements" ||
      travelAgentDecision.mode === "confirm_preferences")
  ) {
    if (
      travelAgentDecision.mode === "collect_requirements" ||
      travelAgentDecision.mode === "confirm_preferences"
    ) {
      return buildGuidedTravelAgentResponse(travelAgentDecision, {
        tripProfile: resolvedTripProfile,
        context,
        message: input.message,
        messages: input.messages,
      });
    }
    return buildNaturalTravelAgentResponse(travelAgentDecision);
  }

  if (!skipNaturalShortcut && isPersonalMemoryRecallIntent(input.message)) {
    return buildPersonalMemoryRecallResponse({
      message: input.message,
      aiContext: input.aiContext,
      memoryContext: input.memoryContext,
      mem0Memories: input.mem0Memories,
      tripProfile: resolvedTripProfile,
      progressSessionId: input.progressSessionId,
      travelAgentDecision,
    });
  }

  const itineraryPatchResponse = await buildExistingItineraryPatchResponse({
    message: input.message,
    messages: input.messages,
    context,
    memoryContext: input.memoryContext,
    progressSessionId: input.progressSessionId,
  });
  if (itineraryPatchResponse) {
    const assistantPayload = validatedAssistantPayload({
      assistantActions: itineraryPatchResponse.assistantActions,
      proposedChanges: itineraryPatchResponse.proposedChanges,
      aiContext: input.aiContext,
    });
    return {
      ...itineraryPatchResponse,
      reply: {
        ...itineraryPatchResponse.reply,
        proposedChanges: assistantPayload.proposedChanges,
        assistantActions: assistantPayload.assistantActions,
      },
      proposedChanges: assistantPayload.proposedChanges,
      assistantActions: assistantPayload.assistantActions,
      travelAgentDecision,
    };
  }

  if (
    !skipNaturalShortcut &&
    isPreferenceOverrideMessage(input.message) &&
    travelAgentDecision.mode === "generate_itinerary" &&
    travelAgentDecision.userFacingGuidance &&
    !input.structuredTravelPlanning &&
    !input.tripProfile
  ) {
    return {
      ...buildNaturalTravelAgentResponse(travelAgentDecision),
      tripProfile: resolvedTripProfile,
    };
  }

  if (input.structuredTravelPlanning) {
    const structuredTripResponse = await handleStructuredTripWorkflow({
      message: input.message,
      context,
      tripProfile: resolvedTripProfile,
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
    context: generalReplyContext,
    memoryContext: input.memoryContext,
  });
  publishProgressStep(input.progressSessionId, {
    phase: "understand",
    label: "整理旅遊問題",
    detail: "已整理問題脈絡。",
    status: "completed",
  });

  const perRoundTimeout = resolveOllamaRoundTimeoutMs();

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
          ...normalizeHistory(generalReplyContext, language),
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
      toolRequests = buildDefaultTravelToolRequests(input.message, generalReplyContext);
    }

    digest = await executeTravelToolRequests(toolRequests, generalReplyContext, input.progressSessionId);
    const interestText = generalReplyContext?.preferences?.interests?.filter(Boolean).join(" ") || "";
    const webSearchQuery = [generalReplyContext?.destination || "", interestText, input.message]
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
    generalReplyContext,
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
  const composeMessages: OllamaMessage[] = [
    { role: "system", content: prompt.system },
    ...normalizeHistory(generalReplyContext, language),
    ...normalizeConversationHistory(input.messages),
    { role: "user", content: prompt.user },
  ];
  const composeOllamaBase = {
    task: "travel-chat" as const,
    timeoutMs: perRoundTimeout,
    options: { temperature: 0, top_p: 0.9, num_ctx: 12_288 },
    messages: composeMessages,
  };
  const shouldUseOpenWebUiGateway = Boolean(serverConfig.openwebuiBaseUrl);

  let raw: string;
  try {
    try {
      if (shouldUseOpenWebUiGateway) {
        raw = await chatWithOpenWebUiTimeoutRetry({
          ...composeOllamaBase,
          format: chatPlanningOutputJsonSchema,
        });
      } else {
        raw = await chatWithOllamaTimeoutRetry({
          ...composeOllamaBase,
          format: chatPlanningOutputJsonSchema,
        });
      }
    } catch (error) {
      if (error instanceof OllamaRequestError && error.code === "http_error") {
        raw = shouldUseOpenWebUiGateway
          ? await chatWithOpenWebUiTimeoutRetry(composeOllamaBase)
          : await chatWithOllamaTimeoutRetry(composeOllamaBase);
      } else {
        throw error;
      }
    }
  } catch (error) {
    if (!(error instanceof OllamaRequestError)) {
      throw error;
    }
    if (!error.isTimeout) {
      throw error;
    }
    const fallbackText = buildTravelChatTimeoutFallbackText(digestText, {
      message: input.message,
      aiContext: input.aiContext,
      memoryContext: input.memoryContext,
      mem0Memories: input.mem0Memories,
      tripProfile: resolvedTripProfile,
    });
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
  const filteredLegacyChanges = filterProposedChangesByVerifiedPlaces(
    structured.proposedChanges,
    digest.placeHits,
  );
  const assistantPayload = validatedAssistantPayload({
    assistantActions: structured.assistantActions,
    proposedChanges: filteredLegacyChanges,
    aiContext: input.aiContext,
  });
  const { assistantActions, proposedChanges } = assistantPayload;
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

  const mergedTripProfile = mergeTripProfileWithContext(resolvedTripProfile, input.context, {
    message: input.message,
    messages: input.messages,
    replyText,
  });
  const followUpCard =
    structured.mode !== "modify_itinerary" &&
    !contextHasItineraryItems(input.context) && !proposedChanges.length && !assistantActions.length
      ? buildQuestionCard(mergedTripProfile, input.context)
      : null;

  if (followUpCard) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: stripRedundantFollowUpPrompts(replyText),
        timestamp: new Date().toLocaleTimeString("zh-TW", {
          hour: "2-digit",
          minute: "2-digit",
        }),
        responseType: "question_card",
        questionCard: followUpCard,
        tripProfile: mergedTripProfile,
        proposedChanges,
        assistantActions,
        sources,
      },
      tripProfile: mergedTripProfile,
      proposedChanges,
      assistantActions,
      travelAgentDecision,
    };
  }

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
      assistantActions,
      sources,
      metadata: { chatPlanningMode: structured.mode },
    },
    tripProfile: mergedTripProfile,
    proposedChanges,
    assistantActions,
    travelAgentDecision,
  };
}
