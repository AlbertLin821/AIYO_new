import type { VideoSummarySegment } from "@/types";
import type { PlaceMention } from "@/server/video/placeMentionExtractor";

export type TravelMomentSegment = {
  id: string;
  timestamp: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  text: string;
  summary: string;
  highlights: string[];
  locationHints: string[];
  foods?: string[];
  sourceTranscriptLineIds?: string[];
  confidence?: number;
  timestampSource?: "youtube-transcript" | "description-fallback";
  timestampConfidence?: "high" | "low";
};

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function buildTitle(name: string): string {
  const lower = name.toLowerCase();
  const suffix =
    /(夜市|市場|market)/i.test(name)
      ? "小吃散步"
      : /(塔|tower)/i.test(name)
        ? "拍照視角"
        : /(城|castle|寺|temple|神社|shrine|公園|park)/i.test(name)
          ? "景點介紹"
          : /(站|車站|station)/i.test(name)
            ? "交通動線"
            : /(火雞肉飯|砂鍋魚頭|拉麵|壽司|takoyaki|ramen|sushi)/i.test(lower)
              ? "必吃重點"
              : "重點";
  const title = `${name}${suffix}`;
  return title.length <= 18 ? title : `${title.slice(0, 17)}…`;
}

function buildDescription(name: string, foods: string[]): string {
  const foodText = foods.slice(0, 2).join("、");
  const sentence = foodText
    ? `這段介紹${name}與${foodText}等旅遊重點。`
    : `這段介紹${name}周邊動線與旅行重點。`;
  return sentence.length <= 80 ? sentence : `${sentence.slice(0, 79)}…`;
}

function buildHighlights(name: string, foods: string[]): string[] {
  const highlights = [`出現地點：${name}`];
  if (foods.length > 0) {
    highlights.push(`相關美食：${foods.slice(0, 3).join("、")}`);
  }
  return highlights;
}

export function buildMomentSegments(input: {
  mentions: PlaceMention[];
  videoDurationSeconds?: number;
  maxSegments?: number;
}): TravelMomentSegment[] {
  const videoDuration = input.videoDurationSeconds ?? Number.MAX_SAFE_INTEGER;
  const candidates = [...input.mentions]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 30);

  const segments: TravelMomentSegment[] = [];
  const maxSegments = input.maxSegments ?? 8;

  for (const mention of candidates) {
    if (segments.length >= maxSegments) {
      break;
    }
    const existing = segments.find(
      (segment) =>
        segment.locationHints.some((hint) => hint === mention.name) &&
        Math.abs(segment.startSeconds - mention.startSeconds) <= 120,
    );
    if (existing) {
      const foods = new Set([...(existing.foods || []), ...(mention.foods || [])]);
      existing.foods = foods.size ? Array.from(foods) : undefined;
      existing.endSeconds = Math.max(existing.endSeconds, mention.endSeconds + 45);
      continue;
    }

    const startSeconds = Math.max(0, mention.startSeconds - 10);
    const endSeconds = Math.min(videoDuration, Math.max(startSeconds + 35, mention.endSeconds + 60));
    const title = buildTitle(mention.name);
    const text = buildDescription(mention.name, mention.foods || []);

    segments.push({
      id: `moment_${segments.length + 1}`,
      timestamp: formatSeconds(startSeconds),
      startSeconds,
      endSeconds,
      title,
      text,
      summary: text,
      highlights: buildHighlights(mention.name, mention.foods || []),
      locationHints: [mention.name],
      foods: mention.foods,
      sourceTranscriptLineIds: mention.sourceTranscriptLineIds,
      confidence: mention.confidence,
      timestampSource: mention.timestampSource,
      timestampConfidence: mention.timestampConfidence,
    });
  }

  const chronological = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  const cap = Math.max(3, Math.min(maxSegments, chronological.length));
  return chronological.slice(0, cap);
}

export function toVideoSummarySegments(segments: TravelMomentSegment[]): VideoSummarySegment[] {
  return segments.map((segment) => ({
    id: segment.id,
    timestamp: segment.timestamp,
    title: segment.title,
    text: segment.text,
    summary: segment.summary,
    highlights: segment.highlights,
    locationHints: segment.locationHints,
    startLabel: segment.timestamp,
    endLabel: formatSeconds(segment.endSeconds),
    startSeconds: segment.startSeconds,
    endSeconds: segment.endSeconds,
    foods: segment.foods,
    confidence: segment.confidence,
    timestampSource: segment.timestampSource,
    timestampConfidence: segment.timestampConfidence,
    sourceTranscriptLineIds: segment.sourceTranscriptLineIds,
    extractionSource: "deterministic",
  }));
}
