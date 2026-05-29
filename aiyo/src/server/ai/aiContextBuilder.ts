import { prisma } from "@/lib/prisma";
import { getTravelPreferenceSuggestion } from "@/server/personalization/personalizationService";
import type {
  ChatContext,
  PersonalizedAIContext,
  TravelAgentKnownPreferences,
  TripPlanRequest,
} from "@/types";

export type AIContextSource =
  | "user_preferences"
  | "recent_trip_history"
  | "trip_chat_history"
  | "global_chat_history"
  | "video_interactions"
  | "applied_video_summaries"
  | "current_trip_context"
  | "memory_snippets"
  | "context_warning";

const CONTEXT_LIMITS = {
  recentTrips: 5,
  recentTripItems: 8,
  tripChatHistory: 10,
  globalChatMemory: 8,
  videoInteractions: 10,
  appliedVideoSummaries: 5,
  currentTripDays: 14,
  currentTripItemsPerDay: 12,
  memorySnippets: 8,
  promptContextChars: 9000,
} as const;

export type AIContextBuildResult = {
  text: string;
  promptContextText: string;
  sources: AIContextSource[];
  structured: {
    preferences?: TravelAgentKnownPreferences;
    recentTripCount: number;
    recentVideoCount: number;
    appliedVideoSummaryCount: number;
  };
  structuredContext: PersonalizedAIContext;
  debug: {
    sources: AIContextSource[];
    includedSources: string[];
    excludedSources: string[];
    counts: Record<string, number>;
    limits: Record<string, number>;
    vectorStore: "mem0" | "none";
  };
};

function truncate(value: string, limit: number) {
  const text = value.trim().replace(/\s+/g, " ");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function addSection(sections: string[], sources: Set<AIContextSource>, source: AIContextSource, title: string, lines: string[]) {
  const clean = lines.map((line) => line.trim()).filter(Boolean);
  if (!clean.length) {
    return;
  }
  sources.add(source);
  sections.push([`[${title}]`, ...clean].join("\n"));
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanStringArray(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value
        .map((item) => {
          if (typeof item === "string") {
            return item.trim();
          }
          if (item && typeof item === "object") {
            const record = item as Record<string, unknown>;
            return cleanString(record.title) || cleanString(record.label) || cleanString(record.name);
          }
          return undefined;
        })
        .filter((item): item is string => Boolean(item))
        .slice(0, limit)
    : [];
}

function parseRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
}

function normalizeRole(value: string): "user" | "assistant" | "system" {
  return value === "assistant" || value === "system" ? value : "user";
}

function budgetLevelFromAmount(amount?: number | null): "low" | "medium" | "high" | undefined {
  if (!amount || amount <= 0) {
    return undefined;
  }
  if (amount <= 20000) {
    return "low";
  }
  if (amount <= 60000) {
    return "medium";
  }
  return "high";
}

function normalizePace(value: unknown): string | undefined {
  if (value === "moderate") {
    return "balanced";
  }
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function timestampList(value: unknown): Array<{ label?: string; timestamp?: string; seconds?: number }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item): { label?: string; timestamp?: string; seconds?: number } | null => {
      if (typeof item === "string") {
        return { label: item };
      }
      const record = parseRecord(item);
      const label = cleanString(record.label) || cleanString(record.title);
      const timestamp = cleanString(record.timestamp) || cleanString(record.time);
      const seconds = typeof record.seconds === "number" ? record.seconds : typeof record.startSeconds === "number" ? record.startSeconds : undefined;
      return label || timestamp || seconds !== undefined ? { label, timestamp, seconds } : null;
    })
    .filter((item): item is { label?: string; timestamp?: string; seconds?: number } => item !== null)
    .slice(0, 12);
}

function summarizeJsonSnapshot(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  if (typeof value === "string") {
    return truncate(value, 600);
  }
  const record = parseRecord(value);
  const summary = cleanString(record.summary) || cleanString(record.title) || cleanString(record.description);
  if (summary) {
    return truncate(summary, 600);
  }
  const places = cleanStringArray(record.places || record.appliedPlaces || record.extractedPlaces, 8);
  return places.length ? `包含地點：${places.join("、")}` : undefined;
}

function buildCurrentTrip(input: {
  trip: {
    id: string;
    title: string;
    destination: string | null;
    days: number;
    itineraryDays: Array<{ id: string; dayNumber: number; summary: string | null }>;
    items: Array<{
      id: string;
      day: number;
      title: string;
      location: string | null;
      timeSlot: string | null;
      description: string | null;
      itemType: string | null;
      order: number;
    }>;
  };
  chatContext?: ChatContext;
}): PersonalizedAIContext["currentTrip"] {
  const days = input.trip.itineraryDays
    .slice(0, CONTEXT_LIMITS.currentTripDays)
    .map((day) => ({
      id: day.id,
      dayNumber: day.dayNumber,
      date: null,
      items: input.trip.items
        .filter((item) => item.day === day.dayNumber)
        .sort((a, b) => a.order - b.order)
        .slice(0, CONTEXT_LIMITS.currentTripItemsPerDay)
        .map((item) => ({
          id: item.id,
          title: item.title,
          location: item.location,
          startTime: item.timeSlot,
          endTime: null,
          notes: item.description,
          category: item.itemType,
        })),
    }));
  return {
    id: input.trip.id,
    title: input.trip.title,
    destination: input.trip.destination || input.chatContext?.destination,
    startDate: input.chatContext?.tripStartDate || null,
    endDate: input.chatContext?.tripEndDate || null,
    days,
  };
}

function promptTextFromStructuredContext(context: PersonalizedAIContext, input: { currentUserInput?: string; tripRequest?: TripPlanRequest }) {
  const sections: string[] = [];
  const sources = new Set<AIContextSource>();

  addSection(sections, sources, "current_trip_context", "目前輸入與行程", [
    input.currentUserInput ? `本次輸入：${truncate(input.currentUserInput, 240)}` : "",
    input.tripRequest ? `行程生成要求：${input.tripRequest.destination} ${input.tripRequest.days} 天` : "",
    context.currentTrip
      ? `目前行程：${context.currentTrip.title || "未命名"}；目的地=${context.currentTrip.destination || "未設定"}；天數=${context.currentTrip.days.length}`
      : "",
    ...(context.currentTrip?.days || []).flatMap((day) => {
      const items = day.items.slice(0, 8).map((item) => `${item.startTime || ""} ${item.title}`).join("、");
      return items ? [`Day ${day.dayNumber}：${items}`] : [];
    }),
  ]);

  addSection(sections, sources, "user_preferences", "使用者偏好摘要", [
    context.preferences.destinationPreferences?.length ? `目的地偏好：${context.preferences.destinationPreferences.join("、")}` : "",
    context.preferences.budgetLevel ? `預算層級：${context.preferences.budgetLevel}` : "",
    context.preferences.travelStyles?.length ? `旅遊風格：${context.preferences.travelStyles.join("、")}` : "",
    context.preferences.pace ? `步調：${context.preferences.pace}` : "",
    context.preferences.transportPreference ? `交通偏好：${context.preferences.transportPreference}` : "",
    context.preferences.accommodationPreference ? `住宿偏好：${context.preferences.accommodationPreference}` : "",
    context.preferences.foodPreferences?.length ? `飲食偏好：${context.preferences.foodPreferences.join("、")}` : "",
    context.preferences.avoidances?.length ? `避免事項：${context.preferences.avoidances.join("、")}` : "",
    context.preferences.source?.length ? `偏好來源：${context.preferences.source.join("、")}` : "",
  ]);

  addSection(
    sections,
    sources,
    "recent_trip_history",
    "近期歷史行程",
    context.recentTrips.map((trip) =>
      truncate(
        `${trip.title || "未命名行程"}；目的地=${trip.destination || "未設定"}；天數=${trip.daysCount || "未設定"}；代表項目=${trip.representativeItems?.join("、") || "無"}`,
        240,
      ),
    ),
  );

  addSection(
    sections,
    sources,
    "trip_chat_history",
    "此行程近期聊天",
    context.tripChatHistory.map((message) => `${message.role}: ${truncate(message.content, 180)}`),
  );

  addSection(
    sections,
    sources,
    "global_chat_history",
    "近期全域聊天摘要",
    context.globalChatMemory.map((message) => `${message.role}: ${truncate(message.content, 160)}`),
  );

  addSection(
    sections,
    sources,
    "video_interactions",
    "近期旅遊影片互動",
    context.videoInteractions.map((video) =>
      truncate(
        `${video.interactionType}: ${video.title || video.videoId || "未命名影片"}；地點=${video.extractedPlaces?.join("、") || "無"}；關聯行程=${video.relatedTripId || "無"}`,
        240,
      ),
    ),
  );

  addSection(
    sections,
    sources,
    "applied_video_summaries",
    "已套用影片摘要",
    context.appliedVideoSummaries.map((summary) =>
      truncate(
        `${summary.title || summary.videoId || "未命名影片"}；套用地點=${summary.appliedPlaces?.join("、") || "無"}；建立項目=${summary.createdTripItems?.join("、") || "無"}；摘要=${summary.summarySnapshot || "無"}`,
        300,
      ),
    ),
  );

  addSection(
    sections,
    sources,
    "memory_snippets",
    "Mem0 長期記憶",
    context.memorySnippets.map((snippet) => truncate(snippet.content, 220)),
  );

  addSection(sections, sources, "context_warning", "Context 限制提醒", context.contextWarnings);

  return { text: truncate(sections.join("\n\n"), CONTEXT_LIMITS.promptContextChars), sources };
}

export async function buildPersonalizedAIContext(input: {
  userId: string;
  currentUserInput?: string;
  chatContext?: ChatContext;
  tripRequest?: TripPlanRequest;
  tripId?: string | null;
  memorySnippets?: Array<{ content: string; source?: "mem0" | "profile" | "chat" | "trip" | "video"; relevance?: number }>;
}): Promise<AIContextBuildResult> {
  const counts: Record<string, number> = {};
  const contextWarnings: string[] = [];
  const includedSources = new Set<string>();
  const excludedSources = new Set<string>();

  const preferenceSuggestion = await getTravelPreferenceSuggestion(input.userId);
  const requestedTripId = input.tripId?.trim() || undefined;
  const currentTrip = requestedTripId
    ? await prisma.trip.findFirst({
        where: { id: requestedTripId, userId: input.userId },
        include: {
          itineraryDays: { orderBy: { sortOrder: "asc" } },
          items: { orderBy: [{ day: "asc" }, { order: "asc" }] },
        },
      })
    : null;

  if (requestedTripId && !currentTrip) {
    excludedSources.add("current_trip_context");
    contextWarnings.push("指定的 tripId 不屬於目前使用者或不存在，已排除 currentTrip context。");
  }

  const [recentTrips, tripMessages, rawGlobalMessages, videoRows, appliedRows] = await Promise.all([
    prisma.trip.findMany({
      where: { userId: input.userId },
      orderBy: { updatedAt: "desc" },
      take: CONTEXT_LIMITS.recentTrips,
      select: {
        id: true,
        destination: true,
        days: true,
        title: true,
        createdAt: true,
        items: {
          orderBy: [{ day: "asc" }, { order: "asc" }],
          take: CONTEXT_LIMITS.recentTripItems,
          select: { title: true, itemType: true, day: true },
        },
      },
    }),
    currentTrip
      ? prisma.chatMessage.findMany({
          where: { userId: input.userId, tripId: currentTrip.id },
          orderBy: { createdAt: "desc" },
          take: CONTEXT_LIMITS.tripChatHistory,
          select: { role: true, content: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.chatMessage.findMany({
      where: { userId: input.userId, tripId: null },
      orderBy: { createdAt: "desc" },
      take: CONTEXT_LIMITS.globalChatMemory * 2,
      select: { role: true, content: true, createdAt: true, metadata: true },
    }),
    prisma.$queryRaw<
      Array<{
        videoId: string;
        title: string | null;
        source: string | null;
        interactionType: string;
        createdAt: Date;
        tripId: string | null;
        extractedPlaces: unknown;
        extractedTimestamps: unknown;
      }>
    >`SELECT "videoId", "title", "source", "interactionType", "createdAt", "tripId", "extractedPlaces", "extractedTimestamps"
      FROM "video_interactions"
      WHERE "userId" = ${input.userId}
      ORDER BY "createdAt" DESC
      LIMIT ${CONTEXT_LIMITS.videoInteractions}`,
    prisma.$queryRaw<
      Array<{
        videoId: string;
        title: string | null;
        appliedAt: Date;
        tripId: string | null;
        summarySnapshot: unknown;
        appliedPlaces: unknown;
        appliedSegments: unknown;
        createdTripItems: unknown;
      }>
    >`SELECT "videoId", "title", "appliedAt", "tripId", "summarySnapshot", "appliedPlaces", "appliedSegments", "createdTripItems"
      FROM "applied_video_summaries"
      WHERE "userId" = ${input.userId}
      ORDER BY "appliedAt" DESC
      LIMIT ${CONTEXT_LIMITS.appliedVideoSummaries}`,
  ]);

  const globalMessages = rawGlobalMessages
    .filter((message) => !cleanString(parseRecord(message.metadata).tripId))
    .slice(0, CONTEXT_LIMITS.globalChatMemory);
  if (globalMessages.length < rawGlobalMessages.length) {
    excludedSources.add("global_chat_history.deleted_trip_candidates");
    contextWarnings.push("部分 tripId 已清空但 metadata 仍指向舊行程的聊天已排除，避免刪除行程後污染全域記憶。");
  }

  const prefs = preferenceSuggestion.preferences;
  const profileRecord = parseRecord((prefs as Record<string, unknown>).profile || {});
  const foodPreferences = cleanStringArray(profileRecord.foodPreferences || (prefs as Record<string, unknown>).foodPreferences);
  const destinationPreferences = [
    prefs.destination,
    ...recentTrips.map((trip) => trip.destination),
  ].filter((value): value is string => Boolean(value?.trim()));
  const preferences: PersonalizedAIContext["preferences"] = {
    destinationPreferences: Array.from(new Set(destinationPreferences)).slice(0, 8),
    budgetLevel: prefs.budgetLevel || budgetLevelFromAmount(prefs.budget),
    travelStyles: prefs.travelStyle,
    pace: normalizePace((prefs as Record<string, unknown>).pace),
    transportPreference: prefs.transportPreference || null,
    accommodationPreference: prefs.accommodationPreference || null,
    foodPreferences,
    avoidances: prefs.avoid,
    confidence: preferenceSuggestion.confidence,
    source: preferenceSuggestion.source,
    updatedAt: preferenceSuggestion.updated_at || null,
  };

  const structuredContext: PersonalizedAIContext = {
    userId: input.userId,
    currentTrip: currentTrip ? buildCurrentTrip({ trip: currentTrip, chatContext: input.chatContext }) : undefined,
    preferences,
    recentTrips: recentTrips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination || undefined,
      daysCount: trip.days,
      summary: trip.items.length
        ? `代表項目：${trip.items.map((item) => item.title).join("、")}`
        : undefined,
      representativeItems: trip.items.map((item) => item.title),
      createdAt: trip.createdAt.toISOString(),
    })),
    tripChatHistory: tripMessages
      .slice()
      .reverse()
      .map((message) => ({
        role: normalizeRole(message.role),
        content: truncate(message.content, 500),
        createdAt: message.createdAt.toISOString(),
      })),
    globalChatMemory: globalMessages
      .slice()
      .reverse()
      .map((message) => ({
        role: normalizeRole(message.role),
        content: truncate(message.content, 360),
        createdAt: message.createdAt.toISOString(),
        source: "chat",
      })),
    videoInteractions: videoRows.map((row) => ({
      videoId: row.videoId,
      title: row.title || undefined,
      source: row.source || undefined,
      interactionType: row.interactionType,
      extractedPlaces: cleanStringArray(row.extractedPlaces, 12),
      extractedTimestamps: timestampList(row.extractedTimestamps),
      relatedTripId: row.tripId,
      createdAt: row.createdAt.toISOString(),
    })),
    appliedVideoSummaries: appliedRows.map((row) => ({
      videoId: row.videoId,
      title: row.title || undefined,
      summarySnapshot: summarizeJsonSnapshot(row.summarySnapshot),
      appliedPlaces: cleanStringArray(row.appliedPlaces, 12),
      appliedSegments: cleanStringArray(row.appliedSegments, 8),
      createdTripItems: cleanStringArray(row.createdTripItems, 12),
      tripId: row.tripId,
      appliedAt: row.appliedAt.toISOString(),
    })),
    memorySnippets: (input.memorySnippets || [])
      .filter((snippet) => snippet.content.trim())
      .slice(0, CONTEXT_LIMITS.memorySnippets)
      .map((snippet) => ({
        ...snippet,
        content: truncate(snippet.content, 500),
      })),
    contextWarnings,
    debug: {
      includedSources: [],
      excludedSources: [],
      limits: { ...CONTEXT_LIMITS },
    },
  };

  counts.currentTripDays = structuredContext.currentTrip?.days.length || 0;
  counts.currentTripItems = structuredContext.currentTrip?.days.reduce((sum, day) => sum + day.items.length, 0) || 0;
  counts.recentTrips = structuredContext.recentTrips.length;
  counts.tripChatMessages = structuredContext.tripChatHistory.length;
  counts.globalChatMessages = structuredContext.globalChatMemory.length;
  counts.videoInteractions = structuredContext.videoInteractions.length;
  counts.appliedVideoSummaries = structuredContext.appliedVideoSummaries.length;
  counts.memorySnippets = structuredContext.memorySnippets.length;

  if (Object.values(preferences).some((value) => Array.isArray(value) ? value.length : Boolean(value))) {
    includedSources.add("user_preferences");
  }
  if (structuredContext.currentTrip) includedSources.add("current_trip_context");
  if (structuredContext.recentTrips.length) includedSources.add("recent_trip_history");
  if (structuredContext.tripChatHistory.length) includedSources.add("trip_chat_history");
  if (structuredContext.globalChatMemory.length) includedSources.add("global_chat_history");
  if (structuredContext.videoInteractions.length) includedSources.add("video_interactions");
  if (structuredContext.appliedVideoSummaries.length) includedSources.add("applied_video_summaries");
  if (structuredContext.memorySnippets.length) includedSources.add("memory_snippets");
  if (structuredContext.contextWarnings.length) includedSources.add("context_warning");
  if (!input.memorySnippets?.length) excludedSources.add("memory_snippets");
  if (!requestedTripId) excludedSources.add("current_trip_context.no_trip_id");

  const prompt = promptTextFromStructuredContext(structuredContext, input);
  const sources = [...prompt.sources];
  structuredContext.debug = {
    includedSources: [...includedSources],
    excludedSources: [...excludedSources],
    limits: { ...CONTEXT_LIMITS },
  };

  const structuredPreferences: TravelAgentKnownPreferences = {
    destination: preferences.destinationPreferences?.[0],
    budgetLevel: preferences.budgetLevel,
    days: prefs.days,
    travelStyle: preferences.travelStyles,
    travelStyles: preferences.travelStyles,
    transportPreference: preferences.transportPreference || undefined,
    accommodationPreference: preferences.accommodationPreference || undefined,
    pace: preferences.pace,
    avoid: preferences.avoidances,
    avoidances: preferences.avoidances,
    foodPreferences: preferences.foodPreferences,
    confidence: preferences.confidence,
    source: preferences.source,
    updatedAt: preferences.updatedAt,
    notes: prefs.notes,
  };

  return {
    text: prompt.text,
    promptContextText: prompt.text,
    sources,
    structured: {
      preferences: Object.values(structuredPreferences).some(Boolean) ? structuredPreferences : undefined,
      recentTripCount: structuredContext.recentTrips.length,
      recentVideoCount: structuredContext.videoInteractions.length,
      appliedVideoSummaryCount: structuredContext.appliedVideoSummaries.length,
    },
    structuredContext,
    debug: {
      sources,
      includedSources: [...includedSources],
      excludedSources: [...excludedSources],
      counts,
      limits: { ...CONTEXT_LIMITS },
      vectorStore: "mem0",
    },
  };
}
