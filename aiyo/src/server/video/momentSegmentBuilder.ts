import type { VideoSummarySegment } from "@/types";
import type { PlaceMention } from "@/server/video/placeMentionExtractor";
import { shouldExcludeAsPoiTitle } from "@/server/video/placeMentionNormalizer";

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

const MAX_CANDIDATE_MENTIONS = 40;

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

/** 依影片時間序，每個 normalized 名詞只保留第一次出現（用於可點擊時間戳）。 */
export function pickFirstOccurrenceMentions(mentions: PlaceMention[]): PlaceMention[] {
  const sorted = [...mentions].sort((a, b) => a.startSeconds - b.startSeconds);
  const seen = new Set<string>();
  const out: PlaceMention[] = [];
  for (const m of sorted) {
    const key = (m.normalizedName || m.name.toLowerCase().replace(/\s+/g, "")).trim();
    if (!key) {
      continue;
    }
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(m);
  }
  return out;
}

export function buildMomentSegments(input: {
  mentions: PlaceMention[];
  videoDurationSeconds?: number;
  maxSegments?: number;
}): TravelMomentSegment[] {
  const videoDuration = input.videoDurationSeconds ?? Number.MAX_SAFE_INTEGER;
  const maxSegments = input.maxSegments ?? 8;

  const filteredMentions = [...input.mentions]
    .filter((m) => !shouldExcludeAsPoiTitle(m.name))
    .slice(0, MAX_CANDIDATE_MENTIONS);
  const uniqueChrono = pickFirstOccurrenceMentions(filteredMentions).slice(0, maxSegments);

  return uniqueChrono.map((mention, index) => {
    const startSeconds = Math.max(0, Math.floor(mention.startSeconds));
    const endSeconds = Math.min(
      videoDuration,
      Math.max(startSeconds + 1, Math.floor(mention.endSeconds)),
    );
    const name = mention.name.trim();

    return {
      id: `moment_${index + 1}`,
      timestamp: formatSeconds(startSeconds),
      startSeconds,
      endSeconds,
      title: name,
      text: "",
      summary: "",
      highlights: [],
      locationHints: [name],
      foods: mention.foods,
      sourceTranscriptLineIds: mention.sourceTranscriptLineIds,
      confidence: mention.confidence,
      timestampSource: mention.timestampSource,
      timestampConfidence: mention.timestampConfidence,
    };
  });
}

export function toVideoSummarySegments(segments: TravelMomentSegment[]): VideoSummarySegment[] {
  return segments.map((segment) => ({
    id: segment.id,
    timestamp: segment.timestamp,
    title: segment.title,
    text: segment.text,
    summary: segment.summary,
    highlights: segment.highlights.length ? segment.highlights : undefined,
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
