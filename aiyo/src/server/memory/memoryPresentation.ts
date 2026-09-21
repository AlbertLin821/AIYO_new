import { prisma } from "@/lib/prisma";
import { getItineraryItemTitleViolation } from "@/lib/itineraryPlaceTitle";
import type { Mem0MemoryRecord } from "@/server/memory/mem0Client";
import { listMemories } from "@/server/memory/mem0Client";
import { isUserFacingMemorySnippet } from "@/server/memory/personalMemoryRecall";
import {
  extractUserIdentityLabel,
  formatUserIdentityMemory,
} from "@/lib/chat/userIdentity";
import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import type { ChatResponsePayload, MemoryRecord, TripProfile, TripPlanResult } from "@/types";

const MAX_TRIP_MEMORY_ITEMS = 6;
const MAX_MEM0_DISPLAY = 8;

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function isGenericMemoryIntent(memory: string): boolean {
  const normalized = memory.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return (
    /^user wants to plan\b/.test(normalized) ||
    /^the user wants to plan\b/.test(normalized) ||
    /^user asked for\b/.test(normalized) ||
    /^想規劃\b/u.test(memory) ||
    /^要規劃\b/u.test(memory)
  );
}

function isApproximatePlanningFact(memory: string): boolean {
  return /around\b|approx(?:imate|imately)?\b|大約|約|左右/u.test(memory);
}

function isGenericTripPlaceholder(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) {
    return true;
  }
  if (/^(早餐|午餐|晚餐|機場接送)$/u.test(trimmed)) {
    return true;
  }
  if (
    /^(文化|歷史|自然|娛樂|購物|市區|在地|特色|休閒)(?:公園|市場|商圈|街區|老街|景點|體驗)$/u.test(
      trimmed,
    )
  ) {
    return true;
  }
  return Boolean(getItineraryItemTitleViolation(trimmed));
}

function collectTripRepresentativeItems(items: Array<{ title: string }>): string[] {
  return dedupeStrings(items.map((item) => item.title).filter((title) => !isGenericTripPlaceholder(title))).slice(
    0,
    MAX_TRIP_MEMORY_ITEMS,
  );
}

function buildTripSummaryMemory(record: {
  id: string;
  title: string;
  destination: string | null;
  days: number;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{ title: string }>;
}): MemoryRecord {
  const representativeItems = collectTripRepresentativeItems(record.items);
  const headerParts = [record.destination || record.title, `${record.days} 天`].filter(Boolean);
  const lines = [headerParts.join("｜") || record.title];
  if (representativeItems.length) {
    lines.push(`代表地點：${representativeItems.join("、")}`);
  }
  return {
    id: `trip:${record.id}`,
    memory: lines.join("\n"),
    created_at: record.createdAt.toISOString(),
    updated_at: record.updatedAt.toISOString(),
    metadata: {
      source: "trip-summary",
      tripId: record.id,
      tripTitle: record.title,
      destination: record.destination,
      representativeItems,
    },
    kind: "trip_summary",
    editable: false,
    deletable: false,
  };
}

function normalizeMem0DisplayRecord(record: Mem0MemoryRecord): MemoryRecord | null {
  const memory = record.memory?.trim() || "";
  if (!memory || !isUserFacingMemorySnippet(memory) || isGenericMemoryIntent(memory)) {
    return null;
  }
  if (isApproximatePlanningFact(memory) && /trip|travel|行程|旅行/u.test(memory)) {
    return null;
  }
  return {
    id: record.id,
    memory,
    user_id: record.user_id,
    metadata: record.metadata,
    created_at: record.created_at,
    updated_at: record.updated_at,
    kind: "mem0",
    editable: true,
    deletable: true,
  };
}

export async function listDisplayMemoriesForUser(userId: string): Promise<MemoryRecord[]> {
  const trips = await prisma.trip.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: 6,
    select: {
      id: true,
      title: true,
      destination: true,
      days: true,
      createdAt: true,
      updatedAt: true,
      items: {
        orderBy: [{ day: "asc" }, { order: "asc" }],
        take: 16,
        select: { title: true },
      },
    },
  });

  let mem0Records: Mem0MemoryRecord[] = [];
  try {
    mem0Records = await listMemories(userId);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[memoryPresentation] Mem0 display memories skipped", error);
    }
  }

  const tripRecords = trips
    .filter((trip) => trip.destination?.trim() || trip.items.length > 0)
    .map(buildTripSummaryMemory);

  const mem0Display = dedupeStrings(
    mem0Records
      .map(normalizeMem0DisplayRecord)
      .filter((record): record is MemoryRecord => Boolean(record))
      .map((record) => JSON.stringify(record)),
  )
    .map((row) => JSON.parse(row) as MemoryRecord)
    .slice(0, MAX_MEM0_DISPLAY);

  return [...tripRecords, ...mem0Display].sort((left, right) =>
    (right.updated_at || right.created_at || "").localeCompare(left.updated_at || left.created_at || ""),
  );
}

function normalizeTripDateRange(profile?: TripProfile | null): string | undefined {
  const start = profile?.travel_dates?.start?.trim();
  const end = profile?.travel_dates?.end?.trim();
  if (start && end) {
    return `${start} 至 ${end}`;
  }
  return start || end || undefined;
}

function normalizeTravelerCount(profile?: TripProfile | null): string | undefined {
  const count = profile?.traveler_count;
  if (typeof count === "number" && Number.isFinite(count) && count > 0) {
    return `${count} 人`;
  }
  return undefined;
}

function summarizeTripPlanPlaces(plan?: TripPlanResult | null): string[] {
  if (!plan) {
    return [];
  }
  return dedupeStrings(
    plan.days
      .flatMap((day) => day.items)
      .map((item) => item.title)
      .filter((title) => !isGenericTripPlaceholder(title)),
  ).slice(0, MAX_TRIP_MEMORY_ITEMS);
}

function explicitUserMemoryStatement(message: string): string | undefined {
  const text = message.trim();
  // Only an affirmative request containing an actual statement is a memory write.
  // Recall questions and deletion requests must never become new user facts.
  if (!text || /[?？]|(?:嗎|吗|呢)[。！!\s]*$|忘記|忘记|刪除|删除|不要記|不要记|不用記|不用记|不必記|不必记/u.test(text)) return undefined;
  const match = text.match(/^(?:(?:請|请)(?:你)?|(?:請|请)?(?:幫我|帮我))?(?:記住|记住|記得|记得)(?:一下)?[：:\s，,]*(.+)$/u);
  const statement = match?.[1]?.trim();
  if (!statement || statement.length < 3 || /^(?:這個|这个|這件事|这件事|以上|這些|这些|我的偏好)[。！!\s]*$/u.test(statement)) return undefined;
  if (/是否|是不是|什麼|什么|哪(?:裡|里|個|个)|幾(?:個|天)|几个/u.test(statement)) return undefined;
  return text.slice(0, 2000);
}

export function buildStableMemoryMessages(input: {
  userMessage: string;
  tripProfile?: TripProfile | null;
  aiContext?: AIContextBuildResult | null;
  response: ChatResponsePayload;
}): Array<{ role: "user" | "assistant"; content: string }> {
  const explicitStatement = explicitUserMemoryStatement(input.userMessage);
  const stableLines: string[] = [];
  const identityLabel = extractUserIdentityLabel(input.userMessage);
  if (identityLabel) {
    stableLines.push(formatUserIdentityMemory(identityLabel));
  }

  const destination =
    input.tripProfile?.destination?.trim() ||
    input.aiContext?.structuredContext.currentTrip?.destination?.trim();
  const durationDays = input.tripProfile?.duration_days;
  const dateRange = normalizeTripDateRange(input.tripProfile);
  const travelerCount = normalizeTravelerCount(input.tripProfile);
  const transport = input.tripProfile?.transportation?.trim() || undefined;
  const pace = input.tripProfile?.pace?.trim() || undefined;
  const preferences = dedupeStrings(input.tripProfile?.preferences || []);
  const itineraryPlaces = summarizeTripPlanPlaces(input.response.itinerarySuggestion);

  if (destination) {
    const detailParts = [
      durationDays ? `${durationDays} 天` : "",
      dateRange || "",
      travelerCount || "",
    ].filter(Boolean);
    stableLines.push(
      detailParts.length
        ? `${destination} 這趟行程已確認：${detailParts.join("，")}`
        : `${destination} 是使用者正在規劃的主要目的地`,
    );
  }

  const preferenceParts = [
    transport ? `交通偏好：${transport}` : "",
    pace ? `旅遊節奏：${pace}` : "",
    preferences.length ? `興趣：${preferences.join("、")}` : "",
  ].filter(Boolean);
  if (destination && preferenceParts.length) {
    stableLines.push(`${destination} 這趟行程的偏好：${preferenceParts.join("；")}`);
  }

  if (destination && itineraryPlaces.length) {
    stableLines.push(`${destination} 行程目前規劃的代表地點：${itineraryPlaces.join("、")}`);
  }

  const normalized = dedupeStrings(stableLines);
  return [
    ...(explicitStatement ? [{ role: "user" as const, content: explicitStatement }] : []),
    ...normalized.filter((content) => content !== explicitStatement).map((content) => ({ role: "assistant" as const, content })),
  ];
}
