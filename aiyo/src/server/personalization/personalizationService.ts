import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { clearUserChatMessages, ensureProfile, toUserProfile } from "@/server/data/appStateService";
import { deleteMemory, listMemories } from "@/server/memory/mem0Client";
import type { TravelPace, TravelPreferences, TripPlanItem } from "@/types";

export type TravelPreferenceSuggestion = {
  has_previous_preferences: boolean;
  preferences: {
    destination?: string;
    budget?: number;
    budgetLevel?: "low" | "medium" | "high";
    days?: number;
    travelStyle?: string[];
    transportPreference?: string;
    accommodationPreference?: string;
    companionType?: string;
    mustVisit?: string[];
    avoid?: string[];
    notes?: string;
  };
  source: string[];
  updated_at?: string;
  confidence?: number;
};

export type VideoInteractionInput = {
  tripId?: string | null;
  videoId: string;
  source?: string;
  videoUrl?: string;
  title?: string;
  interactionType: "watch" | "analyze";
  analysisId?: string;
  summaryId?: string;
  watchDurationSeconds?: number;
  progress?: number;
  extractedPlaces?: unknown;
  extractedTimestamps?: unknown;
  metadata?: Record<string, unknown>;
};

export type AppliedVideoSummaryInput = {
  tripId?: string | null;
  videoId: string;
  summaryId?: string;
  videoUrl?: string;
  title?: string;
  appliedPlaces?: unknown;
  appliedSegments?: unknown;
  createdTripItems?: unknown;
  summarySnapshot?: unknown;
};

type JsonRecord = Record<string, unknown>;

function parseRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as JsonRecord) } : {};
}

function cleanString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cleanStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => cleanString(item)).filter((item): item is string => Boolean(item))
    : [];
}

function budgetLevelFromAmount(amount?: number | null): TravelPreferenceSuggestion["preferences"]["budgetLevel"] {
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

function normalizePace(value: unknown): TravelPace {
  return value === "relaxed" || value === "intensive" ? value : "moderate";
}

export function toTripPlanPreferences(suggestion: TravelPreferenceSuggestion): TravelPreferences {
  const prefs = suggestion.preferences;
  return {
    interests: prefs.travelStyle || [],
    pace: normalizePace((prefs as JsonRecord).pace),
    transportPreference: prefs.transportPreference || "Transit",
    budget: prefs.budget,
    mustVisit: prefs.mustVisit || [],
    avoid: prefs.avoid || [],
    notes: prefs.notes,
  };
}

export async function getTravelPreferenceSuggestion(userId: string): Promise<TravelPreferenceSuggestion> {
  const user = await ensureProfile(userId);
  const profile = toUserProfile({
    name: user.name,
    email: user.email,
    preferences: user.profile?.preferences,
    budget: user.profile?.budget,
    destination: user.profile?.destination,
  });
  const profilePrefs = parseRecord(user.profile?.preferences);
  const latestTrip = await prisma.trip.findFirst({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    select: { destination: true, days: true, updatedAt: true, items: { select: { title: true }, take: 5 } },
  });

  const destination = profile.destination || latestTrip?.destination || undefined;
  const budget = profile.budget || undefined;
  const days = profile.travelDays || latestTrip?.days || undefined;
  const interests = profile.interests.length ? profile.interests : cleanStringArray(profilePrefs.interests);
  const transportPreference = profile.preferredTransport || cleanString(profilePrefs.preferredTransport);
  const notesParts = [
    cleanString(profilePrefs.notes),
    latestTrip?.items.length ? `最近行程包含：${latestTrip.items.map((item) => item.title).join("、")}` : "",
  ].filter(Boolean);

  const source: string[] = [];
  if (destination || budget || interests.length || transportPreference || profile.travelDays) {
    source.push("user_profile");
  }
  if (latestTrip?.destination || latestTrip?.days || latestTrip?.items.length) {
    source.push("latest_trip");
  }

  const preferences: TravelPreferenceSuggestion["preferences"] = {
    destination,
    budget,
    budgetLevel: budgetLevelFromAmount(budget),
    days,
    travelStyle: interests,
    transportPreference,
    accommodationPreference: cleanString(profilePrefs.accommodationPreference),
    companionType: cleanString(profilePrefs.companionType),
    mustVisit: cleanStringArray(profilePrefs.mustVisit),
    avoid: cleanStringArray(profilePrefs.avoid),
    notes: notesParts.join("\n") || undefined,
  };

  const has_previous_preferences = Boolean(
    preferences.destination ||
      preferences.budget ||
      preferences.days ||
      preferences.travelStyle?.length ||
      preferences.transportPreference,
  );

  return {
    has_previous_preferences,
    preferences,
    source,
    updated_at: latestTrip?.updatedAt.toISOString(),
    confidence: has_previous_preferences ? Math.min(0.95, 0.45 + source.length * 0.2) : 0,
  };
}

export async function updateTravelPreferencesFromSuggestion(
  userId: string,
  preferences: TravelPreferenceSuggestion["preferences"],
) {
  const user = await ensureProfile(userId);
  const previous = parseRecord(user.profile?.preferences);
  const next: JsonRecord = {
    ...previous,
    interests: preferences.travelStyle || cleanStringArray(previous.interests),
    preferredTransport: preferences.transportPreference || cleanString(previous.preferredTransport) || "",
    travelDays: preferences.days,
    mustVisit: preferences.mustVisit || cleanStringArray(previous.mustVisit),
    avoid: preferences.avoid || cleanStringArray(previous.avoid),
    notes: preferences.notes || cleanString(previous.notes),
    accommodationPreference:
      preferences.accommodationPreference || cleanString(previous.accommodationPreference),
    companionType: preferences.companionType || cleanString(previous.companionType),
  };

  await prisma.profile.upsert({
    where: { userId },
    update: {
      budget: preferences.budget ?? null,
      destination: preferences.destination ?? null,
      preferences: next as Prisma.InputJsonValue,
    },
    create: {
      userId,
      budget: preferences.budget ?? null,
      destination: preferences.destination ?? null,
      preferences: next as Prisma.InputJsonValue,
    },
  });
}

export async function resetTravelPreferences(userId: string) {
  const user = await ensureProfile(userId);
  const prev = parseRecord(user.profile?.preferences);
  const next: JsonRecord = {};
  for (const key of ["activeTripId", "welcomeCompleted"]) {
    if (prev[key] !== undefined) {
      next[key] = prev[key];
    }
  }
  await prisma.profile.upsert({
    where: { userId },
    update: { budget: null, destination: null, preferences: next as Prisma.InputJsonValue },
    create: { userId, budget: null, destination: null, preferences: next as Prisma.InputJsonValue },
  });
  return { cleared: ["budget", "destination", "travel_preferences"] };
}

export async function deleteUserExternalMemories(userId: string) {
  const memories = await listMemories(userId);
  let deleted = 0;
  for (const memory of memories) {
    await deleteMemory(memory.id);
    deleted += 1;
  }
  return deleted;
}

export async function deleteUserAiMemory(userId: string) {
  const [chatMessages, externalMemories] = await Promise.all([
    clearUserChatMessages(userId),
    deleteUserExternalMemories(userId).catch(() => 0),
  ]);
  return {
    chatMessages,
    externalMemories,
    vectorStore: "mem0",
  };
}

export async function clearAllPersonalizationData(userId: string) {
  const externalMemories = await deleteUserExternalMemories(userId).catch(() => 0);
  const result = await prisma.$transaction(async (tx) => {
    const [chatMessages, videoInteractions, appliedSummaries] = await Promise.all([
      tx.chatMessage.deleteMany({ where: { userId } }),
      tx.$executeRaw`DELETE FROM "video_interactions" WHERE "userId" = ${userId}`,
      tx.$executeRaw`DELETE FROM "applied_video_summaries" WHERE "userId" = ${userId}`,
    ]);
    await tx.profile.upsert({
      where: { userId },
      update: { budget: null, destination: null, preferences: {} },
      create: { userId, budget: null, destination: null, preferences: {} },
    });
    return {
      chatMessages: chatMessages.count,
      videoInteractions: Number(videoInteractions),
      appliedSummaries: Number(appliedSummaries),
    };
  });
  return { ...result, externalMemories, vectorStore: "mem0" };
}

export async function recordVideoInteraction(userId: string, input: VideoInteractionInput) {
  const id = randomUUID();
  const ownedTripId = await resolveOwnedTripId(userId, input.tripId);
  await prisma.$executeRaw`
    INSERT INTO "video_interactions" (
      "id", "userId", "tripId", "videoId", "source", "videoUrl", "title",
      "interactionType", "analysisId", "summaryId", "watchDurationSeconds", "progress",
      "extractedPlaces", "extractedTimestamps", "metadata"
    )
    VALUES (
      ${id}, ${userId}, ${ownedTripId}, ${input.videoId}, ${input.source ?? null},
      ${input.videoUrl ?? null}, ${input.title ?? null}, ${input.interactionType},
      ${input.analysisId ?? null}, ${input.summaryId ?? null}, ${input.watchDurationSeconds ?? null},
      ${input.progress ?? null},
      CAST(${JSON.stringify(input.extractedPlaces ?? null)} AS JSONB),
      CAST(${JSON.stringify(input.extractedTimestamps ?? null)} AS JSONB),
      CAST(${JSON.stringify(input.metadata ?? null)} AS JSONB)
    )
  `;
  return { id };
}

export async function recordAppliedVideoSummary(userId: string, input: AppliedVideoSummaryInput) {
  const id = randomUUID();
  const ownedTripId = await resolveOwnedTripId(userId, input.tripId);
  await prisma.$executeRaw`
    INSERT INTO "applied_video_summaries" (
      "id", "userId", "tripId", "videoId", "summaryId", "videoUrl", "title",
      "appliedPlaces", "appliedSegments", "createdTripItems", "summarySnapshot"
    )
    VALUES (
      ${id}, ${userId}, ${ownedTripId}, ${input.videoId}, ${input.summaryId ?? null},
      ${input.videoUrl ?? null}, ${input.title ?? null},
      CAST(${JSON.stringify(input.appliedPlaces ?? null)} AS JSONB),
      CAST(${JSON.stringify(input.appliedSegments ?? null)} AS JSONB),
      CAST(${JSON.stringify(input.createdTripItems ?? null)} AS JSONB),
      CAST(${JSON.stringify(input.summarySnapshot ?? null)} AS JSONB)
    )
  `;
  await recordVideoInteraction(userId, {
    tripId: ownedTripId,
    videoId: input.videoId,
    videoUrl: input.videoUrl,
    title: input.title,
    interactionType: "analyze",
    summaryId: input.summaryId,
    extractedPlaces: input.appliedPlaces,
    metadata: { source: "applied_video_summary" },
  });
  return { id };
}

export async function resolveOwnedTripId(userId: string, tripId?: string | null): Promise<string | null> {
  const normalized = tripId?.trim();
  if (!normalized) {
    return null;
  }
  const trip = await prisma.trip.findFirst({
    where: { id: normalized, userId },
    select: { id: true },
  });
  if (!trip) {
    throw new Error("trip_not_owned");
  }
  return trip.id;
}

export async function getUserTravelActivitySummary(userId: string) {
  const [profileSuggestion, recentTrips, recentVideoRows, appliedRows, chatRows] = await Promise.all([
    getTravelPreferenceSuggestion(userId),
    prisma.trip.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      select: { id: true, destination: true, days: true, title: true, updatedAt: true },
    }),
    prisma.$queryRaw<
      Array<{ videoId: string; title: string | null; interactionType: string; createdAt: Date; extractedPlaces: unknown }>
    >`SELECT "videoId", "title", "interactionType", "createdAt", "extractedPlaces"
      FROM "video_interactions"
      WHERE "userId" = ${userId}
      ORDER BY "createdAt" DESC
      LIMIT 8`,
    prisma.$queryRaw<
      Array<{ videoId: string; title: string | null; appliedAt: Date; appliedPlaces: unknown }>
    >`SELECT "videoId", "title", "appliedAt", "appliedPlaces"
      FROM "applied_video_summaries"
      WHERE "userId" = ${userId}
      ORDER BY "appliedAt" DESC
      LIMIT 8`,
    prisma.chatMessage.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { role: true, content: true, createdAt: true },
    }),
  ]);

  const destinations = Array.from(
    new Set(recentTrips.map((trip) => trip.destination?.trim()).filter((value): value is string => Boolean(value))),
  );
  const placeHints = [
    ...recentVideoRows.flatMap((row) => cleanStringArray(row.extractedPlaces)),
    ...appliedRows.flatMap((row) => cleanStringArray(row.appliedPlaces)),
  ]
    .slice(0, 12);

  return {
    preferences: profileSuggestion.preferences,
    recentDestinations: destinations,
    recentTrips: recentTrips.map((trip) => ({
      id: trip.id,
      title: trip.title,
      destination: trip.destination,
      days: trip.days,
      updatedAt: trip.updatedAt.toISOString(),
    })),
    recentVideos: recentVideoRows.map((row) => ({
      videoId: row.videoId,
      title: row.title,
      interactionType: row.interactionType,
      createdAt: row.createdAt.toISOString(),
    })),
    appliedVideoSummaries: appliedRows.map((row) => ({
      videoId: row.videoId,
      title: row.title,
      appliedAt: row.appliedAt.toISOString(),
    })),
    frequentPlaceHints: Array.from(new Set(placeHints)),
    recentChatMessages: chatRows.map((row) => ({
      role: row.role,
      content: row.content.slice(0, 240),
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

export function summarizeTripItems(items: Array<Pick<TripPlanItem, "title" | "type" | "notes">>) {
  return items
    .slice(0, 10)
    .map((item) => [item.title, item.type, item.notes].filter(Boolean).join(" | "))
    .join("\n");
}
