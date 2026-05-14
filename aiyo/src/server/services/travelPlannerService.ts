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

function publishProgressStep(
  progressSessionId: string | undefined,
  label: string,
  status: StatusStepPayload["status"],
): void {
  if (!progressSessionId) {
    return;
  }
  publishChatProgress(progressSessionId, {
    type: "status_step",
    label,
    status,
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

function attachSearchFallbackNotice(content: string, warning?: string): string {
  if (!warning) {
    return content;
  }
  const notice = "目前無法連線到搜尋服務，因此以下內容可能不是最新資料。";
  if (content.includes(notice)) {
    return content;
  }
  return `${notice}\n\n${content}`;
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
    output_format: null,
  };
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
  return profile;
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

function applyQuestionAnswers(profile: TripProfile, answers?: ChatQuestionAnswer[]): TripProfile {
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
      case "output_format":
        next.output_format = first === "spreadsheet" || first === "app_flow" ? first : "report";
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
  return next;
}

function buildQuestionCard(profile: TripProfile): QuestionCardPayload | null {
  const destination = profile.destination || "這次";
  const durationLabel = profile.duration_days ? `${profile.duration_days}天${profile.duration_nights ?? Math.max(0, profile.duration_days - 1)}夜` : "這趟";
  const isJapanTrip = /日本|熊本|福岡|東京|大阪|京都|北海道|九州|沖繩|阿蘇|黑川|由布院|別府/u.test(destination);
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
          question: "你最在意這趟旅程的哪個面向？",
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
    !profile.output_format
      ? {
          slot: "output_format" as const,
          question: `這份${destination}行程你希望最後用哪種形式呈現？`,
          type: "single_choice" as const,
          options: [
            { label: "Report 文字版完整行程", value: "report", recommended: true },
            { label: "Spreadsheet 可編輯行程表", value: "spreadsheet" },
            { label: "App 假想成小旅遊 App 流程", value: "app_flow" },
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
          question: "你的總預算大概是多少？",
          type: "budget" as const,
          placeholder: "也可以直接輸入，例如：每人 25000，或總預算 80000",
          options: [
            { label: "省錢型：2-3 萬台幣內", value: "budget" },
            { label: "中等預算：3-5 萬台幣", value: "mid_range", recommended: true },
            { label: "舒適型：5 萬以上", value: "comfortable" },
          ],
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

  if (!profile.departure_location || !profile.travel_dates || !profile.budget || !profile.transportation) {
    return {
      response_type: "question_card",
      title: "再確認幾個行程安排會用到的條件",
      questions: secondRound.slice(0, 4),
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
  const assumptionTexts = uniqueStrings([
    profile.travel_dates ? "" : "使用者尚未提供實際旅遊日期，因此活動與天氣不是即時保證。",
    profile.transportation === "self_drive" ? "交通以自駕邏輯安排。" : "交通以大眾運輸或 AI 建議為主要假設。",
    ...((plan.warnings || []).filter(Boolean)),
  ]);
  return {
    response_type: "travel_plan",
    title,
    revision,
    sources: Object.keys(sources).length ? sources : undefined,
    summary_table: plan.days.map((day) => ({
      day: `Day ${day.dayNumber}`,
      main_route: day.items.map((item) => item.title).join(" -> "),
      citations: cite(day.items.map((item) => `${item.title} ${item.notes || ""}`).join(" ")),
    })),
    days: plan.days.map((day) => {
      const foodItems = day.items.filter((item) => item.type === "restaurant");
      const spotItems = day.items.filter((item) => item.type !== "restaurant");
      return {
        day: `Day ${day.dayNumber}`,
        theme: day.theme || day.summary || `第 ${day.dayNumber} 天`,
        citations: cite(`${day.theme || ""} ${day.summary || ""}`.trim()),
        transportation: uniqueStrings(day.items.map((item) => item.transport || "").filter(Boolean))
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
    { type: "status_step", label: "整理行程需求", status: "completed" },
    { type: "status_step", label: "判斷是否需要查詢即時資訊", status: "completed" },
    { type: "status_step", label: "搜尋景點、交通與美食資訊", status: "completed" },
    { type: "status_step", label: "整理每日路線、交通時間與景點順序", status: "completed" },
    { type: "status_step", label: "生成總覽表格與每日詳細行程", status: "completed" },
  ];
}

async function handleStructuredTripWorkflow(input: {
  message: string;
  context?: ChatContext;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
  progressSessionId?: string;
  memoryContext?: string;
}): Promise<ChatResponsePayload | null> {
  if (!isTripWorkflowMessage(input)) {
    return null;
  }

  publishProgressStep(input.progressSessionId, "整理行程需求", "running");
  const seeded = mergeTripProfile(input.tripProfile, input.context);
  const withText = updateTripProfileFromText(seeded, input.message);
  const profile = applyQuestionAnswers(withText, input.questionAnswers);
  const card = buildQuestionCard(profile);
  publishProgressStep(input.progressSessionId, "整理行程需求", "completed");

  if (card) {
    return {
      reply: {
        id: `assistant_${Date.now()}`,
        role: "assistant",
        content: card.title,
        timestamp: nowChatTimestamp(),
        responseType: "question_card",
        questionCard: card,
        tripProfile: profile,
      },
      tripProfile: profile,
    };
  }

  publishProgressStep(input.progressSessionId, "判斷是否需要查詢即時資訊", "running");
  const request = profileToTripPlanRequest(profile, input.context);
  publishProgressStep(input.progressSessionId, "判斷是否需要查詢即時資訊", "completed");
  const generated = await generateTripPlan(request, input.memoryContext, input.progressSessionId);
  const webSources = normalizeWebSearchSources(await runWebSearch(
    [profile.destination || "", profile.preferences.join(" "), "行程 交通 美食"].filter(Boolean).join(" ").trim(),
    4,
  ).then((bundle) => bundle.results));
  const sourceDictionary = mergeChatSources(generated.sources, webSources);
  if (Object.keys(sourceDictionary).length > 0) {
    registerChatSources(sourceDictionary);
  }
  publishProgressStep(input.progressSessionId, "生成總覽表格與每日詳細行程", "running");
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
  publishProgressStep(input.progressSessionId, "生成總覽表格與每日詳細行程", "completed");
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

async function runWebSearch(query: string, limit?: number): Promise<WebSearchBundle> {
  if (!serverConfig.aiWebSearchEnabled || !serverConfig.searxngEnabled || !shouldUseWebSearch(query)) {
    return { results: [], digest: "" };
  }

  const results = await searchWeb({
    query,
    limit: Math.min(serverConfig.aiWebSearchMaxResults, limit ?? serverConfig.aiWebSearchMaxResults),
  });
  if (!results.length) {
    return {
      results: [],
      digest: "",
      warning: "目前無法連線到搜尋服務，因此以下內容可能不是最新資料。",
    };
  }
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
  if (!searchResults.length && !warning) {
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

  const warningSet = new Set(plan.warnings || []);
  if (warning) {
    warningSet.add(warning);
  }
  return {
    ...plan,
    days: nextDays,
    warnings: warningSet.size ? [...warningSet] : undefined,
  };
}

function buildFallbackTripPlan(request: TripPlanRequest): TripPlanResult {
  const chinese = isCjk(
    [request.destination, request.preferences.notes, request.preferences.interests.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const mustVisit = request.preferences.mustVisit || [];
  const interests = request.preferences.interests || [];
  const lunchLabel = chinese ? "在地午餐" : "Local lunch";
  const dinnerLabel = chinese ? "晚餐與散步" : "Dinner and evening walk";
  const transportLabel = request.preferences.transportPreference || (chinese ? "大眾運輸" : "Public transit");
  const summary = chinese
    ? `${request.destination} ${request.days} 天行程已建立。此版本為模型格式失敗時的保底規劃，可直接再請 AI 微調。`
    : `Created a ${request.days}-day itinerary for ${request.destination}. This is a fallback plan used when the model response format is invalid.`;

  const themePool = chinese
    ? ["老城散步", "在地美食", "文化景點", "港灣與夜色", "市場巡遊"]
    : ["Old town walk", "Local food", "Culture stops", "Harbor evening", "Market route"];

  const interestPool = interests.length
    ? interests
    : chinese
      ? ["美食", "散步", "古蹟"]
      : ["food", "walking", "landmarks"];

  const days: TripPlanDay[] = Array.from({ length: request.days }, (_, index) => {
    const dayNumber = index + 1;
    const featuredStop = mustVisit[index] || mustVisit[0] || `${request.destination}${chinese ? "市區" : " city center"}`;
    const secondaryInterest = interestPool[index % interestPool.length];

    return {
      dayNumber,
      theme: `${themePool[index % themePool.length]}${chinese ? "" : ` ${dayNumber}`}`,
      summary: chinese
        ? `第 ${dayNumber} 天以 ${featuredStop} 與 ${secondaryInterest} 為主。`
        : `Day ${dayNumber} focuses on ${featuredStop} and ${secondaryInterest}.`,
      items: [
        {
          id: `fallback_${dayNumber}_1`,
          dayNumber,
          time: "09:00",
          title: featuredStop,
          type: "attraction",
          transport: transportLabel,
          notes: chinese
            ? `從 ${featuredStop} 開始，優先安排步行可串聯的區域。`
            : `Start from ${featuredStop} and keep the route spatially coherent.`,
          source: "ai",
        },
        {
          id: `fallback_${dayNumber}_2`,
          dayNumber,
          time: "12:00",
          title: chinese ? `${request.destination}${lunchLabel}` : `${request.destination} ${lunchLabel}`,
          type: "restaurant",
          transport: transportLabel,
          notes: chinese
            ? `依照 ${secondaryInterest} 偏好安排用餐與短暫休息。`
            : `Lunch stop aligned with the user's ${secondaryInterest} preference.`,
          source: "ai",
        },
        {
          id: `fallback_${dayNumber}_3`,
          dayNumber,
          time: "15:00",
          title: chinese ? `${secondaryInterest} 行程` : `${secondaryInterest} stop`,
          type: "activity",
          transport: transportLabel,
          notes: chinese
            ? "保留可彈性調整的停留時間，方便後續再用 AI 微調。"
            : "Leave buffer time so the itinerary can be refined later.",
          source: "ai",
        },
        {
          id: `fallback_${dayNumber}_4`,
          dayNumber,
          time: "18:30",
          title: chinese ? `${request.destination}${dinnerLabel}` : `${request.destination} ${dinnerLabel}`,
          type: "restaurant",
          transport: transportLabel,
          notes: chinese
            ? "晚上安排較輕鬆的收尾動線。"
            : "Use an easier evening route to close the day.",
          source: "ai",
        },
      ],
    };
  });

  return {
    summary,
    days,
    warnings: [
      chinese
        ? "AI 模型輸出格式異常，已改用保底行程模板。"
        : "The AI model returned invalid structured output, so a fallback itinerary template was used.",
    ],
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
  publishProgressStep(progressSessionId, "搜尋景點、交通與美食資訊", "running");
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
  const webSearch = await runWebSearch(searchQuery, serverConfig.aiWebSearchMaxResults);
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
      });
      externalResearch = digest.text.trim();
      researchSources = digest.sources;
    }
  } catch (error) {
    console.warn("[trip-plan] research_failed", error);
  }
  publishProgressStep(progressSessionId, "搜尋景點、交通與美食資訊", "completed");

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
  publishProgressStep(progressSessionId, "整理每日路線、交通時間與景點順序", "running");
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
        const fallback = buildFallbackTripPlan(request);
        console.warn("[trip-plan] timeout,fallback");
        publishProgressStep(progressSessionId, "整理每日路線、交通時間與景點順序", "completed");
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
    console.info(`[trip-plan] parse_mode=${parsed.diagnostics.parseMode} retry_count=${retryCount}`);
    publishProgressStep(progressSessionId, "整理每日路線、交通時間與景點順序", "completed");
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
          const fallback = buildFallbackTripPlan(request);
          console.warn("[trip-plan] timeout,fallback");
          publishProgressStep(progressSessionId, "整理每日路線、交通時間與景點順序", "completed");
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
      if (parsed.diagnostics.parseMode === "normalized") {
        console.info("[trip-plan] normalized");
      }
      publishProgressStep(progressSessionId, "整理每日路線、交通時間與景點順序", "completed");
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
      const fallback = buildFallbackTripPlan(request);
      console.warn(
        `[trip-plan] ${retryError.message === "MODEL_OUTPUT_JSON_MISSING" ? "json_missing" : "json_invalid"},fallback`,
      );
      publishProgressStep(progressSessionId, "整理每日路線、交通時間與景點順序", "completed");
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
}): Promise<ChatResponsePayload> {
  if (input.structuredTravelPlanning) {
    const structuredTripResponse = await handleStructuredTripWorkflow({
      message: input.message,
      context: input.context,
      tripProfile: input.tripProfile,
      questionAnswers: input.questionAnswers,
      progressSessionId: input.progressSessionId,
      memoryContext: input.memoryContext,
    });
    if (structuredTripResponse) {
      return structuredTripResponse;
    }
  }

  const itineraryInquiryResponse = buildExistingItineraryInquiryResponse({
    message: input.message,
    context: input.context,
    questionAnswers: input.questionAnswers,
  });
  if (itineraryInquiryResponse) {
    return itineraryInquiryResponse;
  }

  publishProgressStep(input.progressSessionId, "整理旅遊問題", "running");
  const language = detectResponseLanguage(input.message);
  const researchPrompt = buildChatResearchPlanningPrompt({
    message: input.message,
    context: input.context,
    memoryContext: input.memoryContext,
  });
  publishProgressStep(input.progressSessionId, "整理旅遊問題", "completed");

  const perRoundTimeout = Math.min(90_000, Math.max(45_000, Math.floor(serverConfig.ollamaTimeoutMs * 0.75)));

  let rawResearch = "";
  publishProgressStep(input.progressSessionId, "查詢外部資訊", "running");
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

  const digest = await executeTravelToolRequests(toolRequests, input.context);
  const webSearchQuery = [input.context?.destination || "", input.message].filter(Boolean).join(" ").trim();
  const webSearch = await runWebSearch(webSearchQuery, serverConfig.aiWebSearchMaxResults);
  publishProgressStep(input.progressSessionId, "查詢外部資訊", "completed");
  const digestText =
    digest.text.trim() ||
    "未取得可驗證的外部資料；請勿捏造具體餐廳或景點名稱，proposedChanges 請為空陣列。";

  const prompt = buildChatPrompt(
    input.message,
    input.context,
    input.memoryContext,
    digestText,
    webSearch.digest || undefined,
  );

  publishProgressStep(input.progressSessionId, "生成回覆", "running");
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
      : [];
  const replyText = attachSearchFallbackNotice(structured.replyText, webSearch.warning);
  const sources =
    serverConfig.aiWebSearchRequireCitations && webSearch.results.length
      ? toCitationList(webSearch.results, 3)
      : undefined;
  publishProgressStep(input.progressSessionId, "生成回覆", "completed");

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
