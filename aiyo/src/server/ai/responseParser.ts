import type {
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

function parseTripPlanJson(input: string, request: TripPlanRequest): TripPlanResult | null {
  const parsed = JSON.parse(input) as {
    summary?: string;
    days?: Array<Record<string, unknown>>;
  };

  if (!Array.isArray(parsed.days) || parsed.days.length === 0) {
    return null;
  }

  const days: TripPlanDay[] = parsed.days.map((day, dayIndex) => {
    const items = Array.isArray(day.items) ? day.items : [];
    return {
      dayNumber: Number(day.dayNumber) || dayIndex + 1,
      theme: day.theme ? String(day.theme) : `第 ${dayIndex + 1} 天`,
      summary: day.summary ? String(day.summary) : undefined,
      items: items.map((item, itemIndex) => {
        const record = item as Record<string, unknown>;
        const title = String(record.title || `行程點 ${itemIndex + 1}`);
        return {
          id: String(record.id || "").trim() || `ai_${dayIndex + 1}_${itemIndex + 1}`,
          dayNumber: Number(day.dayNumber) || dayIndex + 1,
          time: String(record.time || "09:00"),
          title,
          type: normalizeTripItemType(String(record.type || "attraction")),
          transport: record.transport ? String(record.transport) : undefined,
          notes: record.notes ? String(record.notes) : undefined,
          location: coerceLocation(
            record.location,
            title,
            `${request.destination} · ${title}`,
          ),
          source: "ai",
        };
      }),
    };
  });

  return {
    summary:
      parsed.summary?.trim() ||
      `${request.destination} ${request.days} 日行程規劃概要。`,
    days,
  };
}

export function parseTripPlanResponse(raw: string, request: TripPlanRequest): TripPlanResult {
  const jsonBlock = extractJsonBlock(raw);
  if (!jsonBlock) {
    throw new StructuredOutputError("MODEL_OUTPUT_JSON_MISSING");
  }

  try {
    const direct = parseTripPlanJson(jsonBlock, request);
    if (direct) {
      return direct;
    }
  } catch {
    // Try repaired JSON below.
  }

  try {
    const repaired = parseTripPlanJson(repairJsonLikeString(jsonBlock), request);
    if (repaired) {
      return repaired;
    }
  } catch {
    // fall through
  }

  throw new StructuredOutputError("MODEL_OUTPUT_JSON_INVALID");
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
        ? parsed.segments.map((segment, index) => ({
            id: String(segment.id || `segment_${index + 1}`),
            timestamp: String(segment.timestamp || fallback.segments[index]?.timestamp || "00:00"),
            title: segment.title ? String(segment.title) : undefined,
            text: String(segment.text || segment.summary || fallback.segments[index]?.text || ""),
            locationHints: sanitizeLocationNames(
              Array.isArray(segment.locationHints)
                ? segment.locationHints.map((value) => String(value))
                : [],
            ),
            startLabel: String(segment.timestamp || fallback.segments[index]?.timestamp || "00:00"),
            startSeconds: Number(
              segment.startSeconds ?? fallback.segments[index]?.startSeconds ?? 0,
            ),
            endSeconds: Number(
              segment.endSeconds ?? fallback.segments[index]?.endSeconds ?? 0,
            ),
            summary: String(segment.text || segment.summary || fallback.segments[index]?.text || ""),
          }))
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
