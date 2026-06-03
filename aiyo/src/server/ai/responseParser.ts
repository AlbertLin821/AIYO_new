import { parseTimestampToSeconds } from "@/lib/videoTimestamp";
import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import { getItineraryItemTitleViolation } from "@/lib/itineraryPlaceTitle";
import {
  ChatPlanningOutputSchema,
  TripPlanResultSchema,
} from "@/server/ai/schemas/travelPlanningSchemas";
import { mergeVideoSummarySegmentsByStartSeconds } from "@/server/video/momentSegmentBuilder";
import type {
  ChatPlanningOutput,
  ChatMessage,
  ChatResponsePayload,
  LocationReference,
  TripItemType,
  TripPlanDay,
  TripPlanRequest,
  TripPlanResult,
  VideoSummaryResult,
  VideoSummarySegment,
} from "@/types";

export class StructuredOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StructuredOutputError";
  }
}

export interface TripPlanParseDiagnostics {
  parseMode: "direct" | "repaired" | "normalized";
  repairStage: "none" | "json_repair" | "normalized_repair";
  issues: Array<"json_missing" | "json_invalid" | "normalized" | "must_visit_uncovered" | "avoid_pollution" | "template_pollution" | "title_format_violation">;
}

export function extractJsonBlock(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    return fenceMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return null;
}

function normalizeTripItemType(value: string): TripItemType {
  const allowed: TripItemType[] = [
    "attraction",
    "restaurant",
    "transport",
    "hotel",
    "activity",
    "shopping",
  ];
  return allowed.includes(value as TripItemType)
    ? (value as TripItemType)
    : "attraction";
}

function sanitizeLocationNames(values: string[]): string[] {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 1 && value.length < 80)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function coerceLocation(
  input: unknown,
  fallbackName: string,
  fallbackDescription: string,
): LocationReference | undefined {
  if (!input || typeof input !== "object") {
    return undefined;
  }
  const record = input as Record<string, unknown>;
  const lat = Number(record.lat);
  const lng = Number(record.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return undefined;
  }
  return {
    name: String(record.name || fallbackName),
    lat,
    lng,
    description: String(record.description || fallbackDescription),
    address: record.address ? String(record.address) : undefined,
  };
}

function repairJsonLikeString(input: string): string {
  return input
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'");
}

function validateTripPlanResultStrict(
  parsed: unknown,
): TripPlanResult | null {
  const result = TripPlanResultSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  return [value];
}

function mapItemType(raw: string): TripItemType {
  const normalized = raw.trim().toLowerCase();
  const aliases: Record<string, TripItemType> = {
    attraction: "attraction",
    sightseeing: "attraction",
    landmark: "attraction",
    food: "restaurant",
    meal: "restaurant",
    restaurant: "restaurant",
    dining: "restaurant",
    commute: "transport",
    transfer: "transport",
    transport: "transport",
    hotel: "hotel",
    stay: "hotel",
    activity: "activity",
    event: "activity",
    shopping: "shopping",
    market: "shopping",
  };
  return aliases[normalized] || normalizeTripItemType(raw);
}

function normalizeTimeValue(raw: string | undefined, fallbackHour: number): string {
  if (!raw?.trim()) {
    return `${String(Math.max(0, Math.min(23, fallbackHour))).padStart(2, "0")}:00`;
  }
  const cleaned = raw.trim().replace(".", ":");
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!match) {
    return `${String(Math.max(0, Math.min(23, fallbackHour))).padStart(2, "0")}:00`;
  }
  const hh = Math.max(0, Math.min(23, Number(match[1])));
  const mm = Math.max(0, Math.min(59, Number(match[2] || "0")));
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function timeToMinutes(value: string): number {
  const [h, m] = value.split(":").map((part) => Number(part));
  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return h * 60 + m;
}

function collectRawDayItems(day: Record<string, unknown>): Array<Record<string, unknown>> {
  const structured = toArray(
    (day.items as unknown) ?? day.activities ?? day.stops ?? day.events,
  ).map((entry) => toRecord(entry));
  if (structured.length > 0) {
    return structured;
  }

  const spots = toArray(day.spots).map((entry) => toRecord(entry));
  const foods = toArray(day.food_recommendations).map((entry) => toRecord(entry));
  if (spots.length === 0 && foods.length === 0) {
    return [];
  }

  return [
    ...spots.map((spot, index) => ({
      title: spot.name ?? spot.title,
      name: spot.name,
      type: "attraction",
      notes: spot.feature ?? spot.description ?? spot.desc,
      time: spot.time,
      id: spot.id,
      location: spot.location ?? spot.place ?? spot.poi,
      _fallbackIndex: index,
    })),
    ...foods.map((food, index) => ({
      title: food.name ?? food.title,
      name: food.name,
      type: "restaurant",
      notes: food.description ?? food.feature ?? food.desc,
      time: food.time,
      id: food.id,
      location: food.location ?? food.place ?? food.poi,
      _fallbackIndex: spots.length + index,
    })),
  ];
}

function normalizeLocation(
  input: unknown,
  fallbackName: string,
  fallbackDescription: string,
): LocationReference | undefined {
  const location = coerceLocation(input, fallbackName, fallbackDescription);
  if (!location) {
    return undefined;
  }
  if (!isUsableMapCoordinate(location.lat, location.lng)) {
    return undefined;
  }
  return location;
}

function checkAvoidPollution(
  item: { title: string; notes?: string; location?: LocationReference },
  avoidTerms: string[],
): boolean {
  if (!avoidTerms.length) {
    return false;
  }
  const haystacks = [
    item.title.toLowerCase(),
    (item.notes || "").toLowerCase(),
    (item.location?.name || "").toLowerCase(),
  ];
  return avoidTerms.some((term) => {
    const needle = term.trim().toLowerCase();
    return needle.length > 0 && haystacks.some((hay) => hay.includes(needle));
  });
}

function normalizeTemplateCheckText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function hasTemplatePollution(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const normalized = normalizeTemplateCheckText(value);
  if (!normalized) {
    return false;
  }
  if (/^回答[\u3400-\u9fff_a-z0-9-]+/i.test(normalized)) {
    return true;
  }
  if (/^(answer|reply)\b/.test(normalized)) {
    return true;
  }
  if (/^(public_transport|self_drive|charter_or_tour|ai_recommend|budget|mid_range|comfortable)$/i.test(normalized)) {
    return true;
  }
  if (/^(yt|web|weather|official)_\d+$/i.test(normalized)) {
    return true;
  }
  if (/^plan_[a-z0-9]+$/i.test(normalized)) {
    return true;
  }
  if (/^(food|onsen|history|nature|city_walk|shopping|local_culture)\s*(行程|stop|route)?$/i.test(normalized)) {
    return true;
  }
  if (/^(local lunch|dinner and evening walk|old town walk|local food|culture stops|harbor evening|market route)( \d+)?$/i.test(normalized)) {
    return true;
  }
  if (/^行程點 \d+$/.test(normalized)) {
    return true;
  }
  if (
    normalized.includes("從 回答") ||
    normalized.includes("依照 onsen") ||
    normalized.includes("回答晚餐與散步") ||
    normalized.includes("ai 模型輸出格式異常") ||
    normalized.includes("已改用保底行程模板") ||
    normalized.includes("目前無法連線到搜尋服務") ||
    normalized.includes("代表性景點") ||
    normalized.includes("文化體驗") ||
    normalized.includes("特色街區") ||
    normalized.includes("在地美食") ||
    normalized.includes("夜景或河岸") ||
    normalized.includes("landmark") ||
    normalized.includes("cultural stop") ||
    normalized.includes("neighborhood walk")
  ) {
    return true;
  }
  return false;
}

function parseTripPlanJson(
  input: string,
  request: TripPlanRequest,
  mode: "direct" | "repaired",
): { result: TripPlanResult; diagnostics: TripPlanParseDiagnostics } | null {
  const parsed = JSON.parse(input) as {
    summary?: string;
    days?: Array<Record<string, unknown>>;
    warnings?: unknown;
  };

  const root = toRecord(parsed);
  const strictResult = validateTripPlanResultStrict(root);
  if (strictResult) {
    return {
      result: strictResult,
      diagnostics: {
        parseMode: mode,
        repairStage: mode === "repaired" ? "json_repair" : "none",
        issues: [],
      },
    };
  }
  const rawDays = toArray(
    (root.days as unknown) ?? root.day ?? root.itinerary ?? root.planDays,
  ).map((entry) => toRecord(entry));

  if (rawDays.length === 0) {
    return null;
  }

  const usedDayNumbers = new Set<number>();
  const warnings = new Set<string>(
    toArray(parsed.warnings)
      .map((warning) => String(warning).trim())
      .filter(Boolean),
  );
  const issues: TripPlanParseDiagnostics["issues"] = [];
  let normalized = false;

  const normalizedDays: Array<TripPlanDay | null> = rawDays.map((day, dayIndex) => {
    const aliasDayNumber =
      Number(day.dayNumber ?? day.day ?? day.dayNo ?? day.day_index) || dayIndex + 1;
    const dedupedDayNumber = usedDayNumbers.has(aliasDayNumber)
      ? dayIndex + 1
      : aliasDayNumber;
    usedDayNumbers.add(dedupedDayNumber);
    if (dedupedDayNumber !== aliasDayNumber) {
      normalized = true;
    }

    const rawItems = collectRawDayItems(day);
    if (
      !Array.isArray(day.items) &&
      (Array.isArray(day.spots) || Array.isArray(day.food_recommendations))
    ) {
      normalized = true;
    } else if (!Array.isArray(day.items)) {
      normalized = true;
    }
    if (rawItems.length === 0) {
      return null;
    }

    const items = rawItems.map((record, itemIndex) => {
        const title = String(record.title || record.name || `行程點 ${itemIndex + 1}`);
        const locationInput = record.location || record.place || record.poi;
        const normalizedItem = {
          id:
            String(record.id || "").trim() ||
            `ai_${dedupedDayNumber}_${itemIndex + 1}_${title.toLowerCase().replace(/[^a-z0-9\u3400-\u9fff]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 32) || "item"}`,
          dayNumber: dedupedDayNumber,
          time: normalizeTimeValue(
            record.time ? String(record.time) : undefined,
            9 + itemIndex * 2,
          ),
          title,
          type: mapItemType(String(record.type || record.category || "attraction")),
          transport: record.transport ? String(record.transport) : undefined,
          transportDurationMinutes:
            typeof record.transportDurationMinutes === "number" && record.transportDurationMinutes > 0
              ? Math.round(record.transportDurationMinutes)
              : undefined,
          transportDistanceMeters:
            typeof record.transportDistanceMeters === "number" && record.transportDistanceMeters > 0
              ? Math.round(record.transportDistanceMeters)
              : undefined,
          transportDataSource: record.transportDataSource === "google_routes" ? "google_routes" as const : undefined,
          notes: String(record.notes || record.desc || record.description || "").trim() || undefined,
          location: normalizeLocation(
            locationInput,
            title,
            `${request.destination} · ${title}`,
          ),
          source: "ai" as const,
          sourceTitle: record.sourceTitle ? String(record.sourceTitle).trim() || undefined : undefined,
          sourceUrl: record.sourceUrl ? String(record.sourceUrl).trim() || undefined : undefined,
          sourceSnippet: record.sourceSnippet ? String(record.sourceSnippet).trim() || undefined : undefined,
          confidence:
            record.confidence === "high" || record.confidence === "medium" || record.confidence === "low"
              ? (record.confidence as "high" | "medium" | "low")
              : undefined,
        };
        if (!record.time || !record.type || !record.id) {
          normalized = true;
        }
        return normalizedItem;
      });

    const sortedItems = [...items].sort((a, b) => timeToMinutes(a.time) - timeToMinutes(b.time));
    if (sortedItems.some((item, index) => item.id !== items[index]?.id)) {
      normalized = true;
    }

    return {
      dayNumber: dedupedDayNumber,
      theme: day.theme ? String(day.theme) : `第 ${dedupedDayNumber} 天`,
      summary: day.summary ? String(day.summary) : undefined,
      items: sortedItems,
    };
  });

  const days = normalizedDays.filter((day): day is TripPlanDay => day !== null);

  if (days.length === 0) {
    return null;
  }

  const mustVisitTerms = (request.preferences.mustVisit || [])
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  const allTitles = days.flatMap((day) => day.items.map((item) => item.title.toLowerCase()));
  const uncoveredMustVisit = mustVisitTerms.filter(
    (term) => !allTitles.some((title) => title.includes(term)),
  );
  if (uncoveredMustVisit.length > 0) {
    warnings.add(`QUALITY:MUST_VISIT_UNCOVERED:${uncoveredMustVisit.join("|")}`);
    issues.push("must_visit_uncovered");
  }

  const avoidTerms = (request.preferences.avoid || [])
    .map((value) => value.trim())
    .filter(Boolean);
  const pollutedItems = days
    .flatMap((day) => day.items)
    .filter((item) => checkAvoidPollution(item, avoidTerms));
  if (pollutedItems.length > 0) {
    warnings.add(`QUALITY:AVOID_POLLUTION:${pollutedItems.length}`);
    issues.push("avoid_pollution");
  }

  const templatePollutionCount =
    days.reduce((count, day) => {
      const pollutedDayFields = [
        day.theme,
        day.summary || "",
        ...day.items.flatMap((item) => [item.title, item.notes || "", item.transport || "", item.location?.name || ""]),
      ].filter(hasTemplatePollution).length;
      return count + pollutedDayFields;
    }, 0) + (hasTemplatePollution(parsed.summary || "") ? 1 : 0);
  if (templatePollutionCount > 0) {
    warnings.add(`QUALITY:TEMPLATE_POLLUTION:${templatePollutionCount}`);
    issues.push("template_pollution");
  }

  const titleViolationCount = days
    .flatMap((day) => day.items)
    .filter((item) => getItineraryItemTitleViolation(item.title)).length;
  if (titleViolationCount > 0) {
    warnings.add(`QUALITY:TITLE_FORMAT_VIOLATION:${titleViolationCount}`);
    issues.push("title_format_violation");
  }

  if (normalized) {
    issues.push("normalized");
  }

  return {
    result: {
      summary:
        parsed.summary?.trim() ||
        `${request.destination} ${request.days} 日行程規劃概要。`,
      days,
      warnings: warnings.size > 0 ? [...warnings] : undefined,
    },
    diagnostics: {
      parseMode: normalized ? "normalized" : mode,
      repairStage: mode === "repaired" ? "json_repair" : normalized ? "normalized_repair" : "none",
      issues,
    },
  };
}

export function parseTripPlanResponse(
  raw: string,
  request: TripPlanRequest,
): { result: TripPlanResult; diagnostics: TripPlanParseDiagnostics } {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) {
    throw new StructuredOutputError("MODEL_OUTPUT_JSON_MISSING");
  }

  try {
    const direct = parseTripPlanJson(jsonBlock, request, "direct");
    if (direct) {
      return direct;
    }
  } catch {
    // Try repaired JSON below.
  }

  try {
    const repaired = parseTripPlanJson(repairJsonLikeString(jsonBlock), request, "repaired");
    if (repaired) {
      return repaired;
    }
  } catch {
    // fall through
  }

  throw new StructuredOutputError("MODEL_OUTPUT_JSON_INVALID");
}

export function parseChatPlanningOutput(raw: string): ChatPlanningOutput {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) {
    throw new StructuredOutputError("MODEL_OUTPUT_JSON_MISSING");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonBlock);
  } catch {
    try {
      parsed = JSON.parse(repairJsonLikeString(jsonBlock));
    } catch {
      throw new StructuredOutputError("MODEL_OUTPUT_JSON_INVALID");
    }
  }

  const validated = ChatPlanningOutputSchema.safeParse(parsed);
  if (!validated.success) {
    throw new StructuredOutputError("MODEL_OUTPUT_JSON_INVALID");
  }
  return {
    ...validated.data,
    proposedChanges: validated.data.proposedChanges.map((change) => ({
      ...change,
      source: "ai-chat" as const,
    })),
  } as ChatPlanningOutput;
}

export function parseVideoSummaryResponse(
  raw: string,
  fallback: Pick<VideoSummaryResult, "title" | "summary" | "segments" | "extractedLocations">,
): Pick<VideoSummaryResult, "title" | "summary" | "segments" | "extractedLocations"> & {
  parseFailed: boolean;
} {
  const jsonBlock = extractJsonBlock(raw);
  if (jsonBlock) {
    try {
      const parsed = JSON.parse(jsonBlock) as {
        title?: string;
        summary?: string;
        segments?: Array<Record<string, unknown>>;
        extractedLocations?: string[];
      };

      const segments: VideoSummarySegment[] = Array.isArray(parsed.segments)
        ? mergeVideoSummarySegmentsByStartSeconds(
            parsed.segments.map((segment, index) => {
              const ts = String(segment.timestamp || fallback.segments[index]?.timestamp || "00:00");
              const fromTs = parseTimestampToSeconds(ts);
              const rawStart = Number(segment.startSeconds ?? fallback.segments[index]?.startSeconds ?? 0);
              const startSeconds =
                Number.isFinite(rawStart) && rawStart > 0 ? rawStart : fromTs > 0 ? fromTs : 0;
              const rawEnd = Number(segment.endSeconds ?? fallback.segments[index]?.endSeconds ?? 0);
              const endSeconds = Number.isFinite(rawEnd) && rawEnd > startSeconds ? rawEnd : startSeconds;
              return {
                id: String(segment.id || `segment_${index + 1}`),
                timestamp: ts,
                title: segment.title ? String(segment.title) : undefined,
                text: String(segment.text || segment.summary || fallback.segments[index]?.text || ""),
                locationHints: sanitizeLocationNames(
                  Array.isArray(segment.locationHints)
                    ? segment.locationHints.map((value) => String(value))
                    : [],
                ),
                highlights: Array.isArray(segment.highlights)
                  ? segment.highlights
                      .map((value) => String(value).trim())
                      .filter((value) => value.length > 1 && value.length < 160)
                      .slice(0, 3)
                  : undefined,
                startLabel: ts,
                startSeconds,
                endSeconds,
                summary: String(segment.text || segment.summary || fallback.segments[index]?.text || ""),
              };
            }),
          )
        : fallback.segments;

      return {
        title: parsed.title?.trim() || fallback.title,
        summary: parsed.summary?.trim() || fallback.summary,
        segments: segments.length ? segments : fallback.segments,
        extractedLocations: sanitizeLocationNames([
          ...(Array.isArray(parsed.extractedLocations) ? parsed.extractedLocations.map((value) => String(value)) : []),
          ...segments.flatMap((segment) => segment.locationHints || []),
        ]),
        parseFailed: false,
      };
    } catch {
      return { ...fallback, parseFailed: true };
    }
  }

  return { ...fallback, parseFailed: true };
}

export function parseLocationFilterResponse(raw: string): {
  acceptedLocations: string[];
  rejectedLocations: string[];
  parseFailed: boolean;
} {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) {
    return { acceptedLocations: [], rejectedLocations: [], parseFailed: true };
  }

  try {
    const parsed = JSON.parse(jsonBlock) as {
      acceptedLocations?: string[];
      rejectedLocations?: string[];
    };
    return {
      acceptedLocations: sanitizeLocationNames(
        Array.isArray(parsed.acceptedLocations)
          ? parsed.acceptedLocations.map((value) => String(value))
          : [],
      ),
      rejectedLocations: sanitizeLocationNames(
        Array.isArray(parsed.rejectedLocations)
          ? parsed.rejectedLocations.map((value) => String(value))
          : [],
      ),
      parseFailed: false,
    };
  } catch {
    return { acceptedLocations: [], rejectedLocations: [], parseFailed: true };
  }
}

export function parseVideoMomentPolishingResponse(raw: string): {
  moments: Array<{
    id: string;
    timestamp: string;
    startSeconds: number;
    endSeconds: number;
    title: string;
    text: string;
    summary: string;
    locationHints: string[];
    foods?: string[];
  }>;
  parseFailed: boolean;
} {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) {
    return { moments: [], parseFailed: true };
  }

  try {
    const parsed = JSON.parse(jsonBlock) as {
      moments?: Array<Record<string, unknown>>;
    };
    const moments = (parsed.moments || []).map((moment, index) => ({
      id: String(moment.id || `moment_${index + 1}`),
      timestamp: String(moment.timestamp || "00:00"),
      startSeconds: Number(moment.startSeconds || 0),
      endSeconds: Number(moment.endSeconds || 0),
      title: String(moment.title || ""),
      text: String(moment.text || moment.summary || ""),
      summary: String(moment.summary || moment.text || ""),
      locationHints: sanitizeLocationNames(
        Array.isArray(moment.locationHints) ? moment.locationHints.map((value) => String(value)) : [],
      ),
      foods: sanitizeLocationNames(
        Array.isArray(moment.foods) ? moment.foods.map((value) => String(value)) : [],
      ),
    }));
    return { moments, parseFailed: false };
  } catch {
    return { moments: [], parseFailed: true };
  }
}

export function parseChatResponse(raw: string): ChatResponsePayload {
  const content = raw.trim() || "暫時無法產生有用的回覆。";
  const reply: ChatMessage = {
    id: `assistant_${Date.now()}`,
    role: "assistant",
    content,
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };

  return { reply };
}
