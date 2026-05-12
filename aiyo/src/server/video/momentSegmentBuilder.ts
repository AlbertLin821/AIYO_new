import type { VideoSummarySegment } from "@/types";
import type { PlaceMention } from "@/server/video/placeMentionExtractor";
import type { VerifiedVideoPlace } from "@/server/video/placeExtraction";
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

  const rawSegments = uniqueChrono.map((mention, index) => {
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

  return mergeMomentSegmentsByStartSeconds(rawSegments);
}

function dedupeHintList(hints: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hints) {
    const k = h.replace(/\s+/g, "").toLowerCase();
    if (!k || seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(h);
  }
  return out;
}

/** 合併相同 startSeconds 的連續片段，避免同一時間戳重複列出多個地點列。 */
export function mergeMomentSegmentsByStartSeconds(segments: TravelMomentSegment[]): TravelMomentSegment[] {
  const sorted = [...segments].sort((a, b) => a.startSeconds - b.startSeconds);
  const out: TravelMomentSegment[] = [];
  for (const seg of sorted) {
    const last = out[out.length - 1];
    if (last && last.startSeconds === seg.startSeconds) {
      const mergedHints = dedupeHintList([...(last.locationHints || []), ...(seg.locationHints || [])]);
      last.locationHints = mergedHints;
      last.title = mergedHints[0] || last.title;
      last.endSeconds = Math.max(last.endSeconds, seg.endSeconds);
      last.confidence = Math.max(last.confidence ?? 0, seg.confidence ?? 0);
      const foods = new Set([...(last.foods || []), ...(seg.foods || [])]);
      last.foods = foods.size ? Array.from(foods) : undefined;
      const ids = new Set([...(last.sourceTranscriptLineIds || []), ...(seg.sourceTranscriptLineIds || [])]);
      last.sourceTranscriptLineIds = ids.size ? Array.from(ids) : undefined;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
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

function dedupeSegmentHints(hints: string[] | undefined): string[] | undefined {
  if (!hints?.length) {
    return hints;
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const h of hints) {
    const k = h.replace(/\s+/g, "").toLowerCase();
    if (!k || seen.has(k)) {
      continue;
    }
    seen.add(k);
    out.push(h);
  }
  return out.length ? out : undefined;
}

export function mergeVideoSummarySegmentsByStartSeconds(segments: VideoSummarySegment[]): VideoSummarySegment[] {
  const sorted = [...segments].sort((a, b) => (a.startSeconds ?? 0) - (b.startSeconds ?? 0));
  const out: VideoSummarySegment[] = [];
  for (const seg of sorted) {
    const start = Math.floor(seg.startSeconds ?? 0);
    const last = out[out.length - 1];
    if (last && Math.floor(last.startSeconds ?? 0) === start) {
      const merged = dedupeSegmentHints([...(last.locationHints || []), ...(seg.locationHints || [])]);
      last.locationHints = merged;
      last.title = merged?.[0] || last.title || seg.title;
      last.endSeconds = Math.max(last.endSeconds ?? 0, seg.endSeconds ?? 0);
      last.endLabel = formatSeconds(last.endSeconds ?? 0);
      last.confidence = Math.max(last.confidence ?? 0, seg.confidence ?? 0);
      const foods = new Set([...(last.foods || []), ...(seg.foods || [])]);
      last.foods = foods.size ? Array.from(foods) : undefined;
      const ids = new Set([...(last.sourceTranscriptLineIds || []), ...(seg.sourceTranscriptLineIds || [])]);
      last.sourceTranscriptLineIds = ids.size ? Array.from(ids) : undefined;
    } else {
      out.push({ ...seg });
    }
  }
  return out;
}

export function buildSegmentsFromVerifiedPlaces(input: {
  places: VerifiedVideoPlace[];
  videoDurationSeconds?: number;
  maxSegments?: number;
}): VideoSummarySegment[] {
  const maxSegments = input.maxSegments ?? 8;
  const videoDuration = input.videoDurationSeconds ?? Number.MAX_SAFE_INTEGER;

  const segments = input.places
    .slice()
    .sort((a, b) => {
      const aStart = a.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    })
    .slice(0, maxSegments)
    .map((place, index) => {
      const startSeconds = Math.max(0, Math.floor(place.firstMentionStartSeconds ?? videoDuration + index));
      const endSeconds = place.firstMentionEndSeconds
        ? Math.max(startSeconds + 1, Math.floor(place.firstMentionEndSeconds))
        : Math.min(videoDuration, startSeconds + 1);
      const timestamp = formatSeconds(startSeconds);
      return {
        id: `verified_place_${index + 1}`,
        timestamp,
        title: place.name,
        text: "影片在此時間點提到此地點，可作為行程候選點。",
        summary: "影片在此時間點提到此地點，可作為行程候選點。",
        locationHints: [place.name],
        startLabel: timestamp,
        endLabel: formatSeconds(endSeconds),
        startSeconds: place.firstMentionStartSeconds,
        endSeconds: place.firstMentionEndSeconds ?? endSeconds,
        confidence: place.confidence,
        sourceTranscriptLineIds: place.sourceTranscriptLineIds,
        extractionSource: "deterministic",
      } satisfies VideoSummarySegment;
    });

  return mergeVideoSummarySegmentsByStartSeconds(segments);
}
