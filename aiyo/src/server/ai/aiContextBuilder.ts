import { prisma } from "@/lib/prisma";
import { getUserTravelActivitySummary } from "@/server/personalization/personalizationService";
import type { ChatContext, TravelAgentKnownPreferences, TripPlanRequest } from "@/types";

export type AIContextSource =
  | "user_preferences"
  | "recent_trip_history"
  | "trip_chat_history"
  | "global_chat_history"
  | "video_interactions"
  | "applied_video_summaries"
  | "current_trip_context";

export type AIContextBuildResult = {
  text: string;
  sources: AIContextSource[];
  structured: {
    preferences?: TravelAgentKnownPreferences;
    recentTripCount: number;
    recentVideoCount: number;
    appliedVideoSummaryCount: number;
  };
  debug: {
    sources: AIContextSource[];
    counts: Record<string, number>;
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

export async function buildPersonalizedAIContext(input: {
  userId: string;
  currentUserInput?: string;
  chatContext?: ChatContext;
  tripRequest?: TripPlanRequest;
  tripId?: string | null;
}): Promise<AIContextBuildResult> {
  const sections: string[] = [];
  const sources = new Set<AIContextSource>();
  const counts: Record<string, number> = {};

  const [activity, tripMessages, globalMessages] = await Promise.all([
    getUserTravelActivitySummary(input.userId),
    input.tripId
      ? prisma.chatMessage.findMany({
          where: { userId: input.userId, tripId: input.tripId },
          orderBy: { createdAt: "desc" },
          take: 8,
          select: { role: true, content: true, createdAt: true },
        })
      : Promise.resolve([]),
    prisma.chatMessage.findMany({
      where: { userId: input.userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true, createdAt: true },
    }),
  ]);

  const prefs = activity.preferences;
  addSection(sections, sources, "user_preferences", "使用者偏好摘要", [
    prefs.destination ? `目的地偏好：${prefs.destination}` : "",
    prefs.budget ? `預算：${prefs.budget}（${prefs.budgetLevel || "未分級"}）` : "",
    prefs.days ? `常用天數：${prefs.days}` : "",
    prefs.travelStyle?.length ? `旅遊風格：${prefs.travelStyle.join("、")}` : "",
    prefs.transportPreference ? `交通偏好：${prefs.transportPreference}` : "",
    prefs.accommodationPreference ? `住宿偏好：${prefs.accommodationPreference}` : "",
    prefs.companionType ? `旅伴類型：${prefs.companionType}` : "",
    prefs.notes ? `補充：${truncate(prefs.notes, 400)}` : "",
  ]);

  addSection(sections, sources, "current_trip_context", "目前輸入與行程", [
    input.currentUserInput ? `本次輸入：${truncate(input.currentUserInput, 240)}` : "",
    input.chatContext?.destination ? `目前目的地：${input.chatContext.destination}` : "",
    input.chatContext?.days ? `目前天數：${input.chatContext.days}` : "",
    input.chatContext?.budget ? `目前預算：${input.chatContext.budget}` : "",
    input.tripRequest ? `行程生成要求：${input.tripRequest.destination} ${input.tripRequest.days} 天` : "",
  ]);

  counts.recentTrips = activity.recentTrips.length;
  addSection(
    sections,
    sources,
    "recent_trip_history",
    "近期歷史行程",
    activity.recentTrips.map((trip) =>
      truncate(`${trip.title || "未命名行程"}；目的地=${trip.destination || "未設定"}；天數=${trip.days}`, 180),
    ),
  );

  counts.tripChatMessages = tripMessages.length;
  addSection(
    sections,
    sources,
    "trip_chat_history",
    "此行程近期聊天",
    tripMessages
      .slice()
      .reverse()
      .map((message) => `${message.role}: ${truncate(message.content, 180)}`),
  );

  counts.globalChatMessages = globalMessages.length;
  addSection(
    sections,
    sources,
    "global_chat_history",
    "近期聊天摘要",
    globalMessages
      .slice()
      .reverse()
      .map((message) => `${message.role}: ${truncate(message.content, 160)}`),
  );

  counts.videoInteractions = activity.recentVideos.length;
  addSection(
    sections,
    sources,
    "video_interactions",
    "近期旅遊影片互動",
    activity.recentVideos.map((video) =>
      truncate(`${video.interactionType}: ${video.title || video.videoId}`, 180),
    ),
  );

  counts.appliedVideoSummaries = activity.appliedVideoSummaries.length;
  addSection(
    sections,
    sources,
    "applied_video_summaries",
    "已套用影片摘要",
    activity.appliedVideoSummaries.map((summary) =>
      truncate(`${summary.title || summary.videoId}；套用於 ${summary.appliedAt}`, 180),
    ),
  );

  if (activity.frequentPlaceHints.length) {
    addSection(sections, sources, "video_interactions", "影片與互動常見地點", [
      activity.frequentPlaceHints.slice(0, 12).join("、"),
    ]);
  }

  const structuredPreferences: TravelAgentKnownPreferences = {
    destination: prefs.destination || undefined,
    budget: prefs.budget || undefined,
    budgetLevel: prefs.budgetLevel || undefined,
    days: prefs.days || undefined,
    travelStyle: prefs.travelStyle?.length ? prefs.travelStyle : undefined,
    transportPreference: prefs.transportPreference || undefined,
    accommodationPreference: prefs.accommodationPreference || undefined,
    companionType: prefs.companionType || undefined,
    notes: prefs.notes || undefined,
  };

  return {
    text: sections.join("\n\n"),
    sources: [...sources],
    structured: {
      preferences: Object.values(structuredPreferences).some(Boolean) ? structuredPreferences : undefined,
      recentTripCount: activity.recentTrips.length,
      recentVideoCount: activity.recentVideos.length,
      appliedVideoSummaryCount: activity.appliedVideoSummaries.length,
    },
    debug: {
      sources: [...sources],
      counts,
      vectorStore: "mem0",
    },
  };
}
