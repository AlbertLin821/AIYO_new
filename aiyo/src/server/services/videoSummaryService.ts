import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { serverConfig } from "@/server/config";
import { resolveLocationReference } from "@/server/geo/locationCatalog";
import {
  extractYouTubeVideoId,
  fetchYouTubeMetadata,
  fetchYouTubeTranscript,
  type TranscriptEntry,
} from "@/server/providers/youtubeProvider";
import {
  buildSegmentsFromVerifiedPlaces,
  mergeVideoSummarySegmentsByStartSeconds,
} from "@/server/video/momentSegmentBuilder";
import { extractFinalVideoPlaces } from "@/server/video/placeExtraction";
import { preprocessTranscript } from "@/server/video/transcriptProcessing";
import { selectTravelExtractionProfile } from "@/server/video/travelExtractionProfiles";
import type {
  LocationReference,
  Timestamp,
  VideoRecommendation,
  VideoSummaryDebugMeta,
  VideoSummaryResult,
  VideoSummarySegment,
} from "@/types";

const VIDEO_PIPELINE_VERSION = "video-quality-v6";

function dedupeLocationsByNormalizedName<T extends Pick<LocationReference, "name">>(locations: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const loc of locations) {
    const key = loc.name.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(loc);
  }
  return out;
}
const videoSummaryCache = new Map<string, { expiresAt: number; result: VideoSummaryResult }>();
const VIDEO_SUMMARY_CACHE_MS = 30 * 60 * 1000;

type VideoSummaryCacheRow = {
  result: unknown;
};

interface VideoSummaryInput {
  url?: string;
  videoId?: string;
  title?: string;
  destination?: string;
  /** 略過記憶體／資料庫快取並重新跑完整摘要管線 */
  refresh?: boolean;
}

function isVideoSummaryResult(value: unknown): value is VideoSummaryResult {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Partial<VideoSummaryResult>;
  return (
    result.source === "youtube-summary-service" &&
    typeof result.title === "string" &&
    typeof result.summary === "string" &&
    Array.isArray(result.segments) &&
    Array.isArray(result.extractedLocations) &&
    !!result.video &&
    typeof result.video === "object"
  );
}

function buildSummaryCacheKey(input: { videoId: string; destination?: string; language?: string }): string {
  return [
    VIDEO_PIPELINE_VERSION,
    input.videoId.trim(),
    (input.destination || "").trim() || "any-destination",
    (input.language || "zh-Hant").trim(),
  ].join(":");
}

async function readPersistedVideoSummary(cacheKey: string): Promise<VideoSummaryResult | null> {
  try {
    const rows = await prisma.$queryRaw<VideoSummaryCacheRow[]>`
      SELECT "result"
      FROM "video_summary_caches"
      WHERE "videoId" = ${cacheKey}
      LIMIT 1
    `;
    const result = rows[0]?.result;
    return isVideoSummaryResult(result) ? result : null;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-summary-cache] Failed to read persisted summary.", error);
    }
    return null;
  }
}

async function writePersistedVideoSummary(cacheKey: string, result: VideoSummaryResult): Promise<void> {
  try {
    const id = randomUUID();
    await prisma.$executeRaw`
      INSERT INTO "video_summary_caches" ("id", "videoId", "result", "updatedAt")
      VALUES (${id}, ${cacheKey}, CAST(${JSON.stringify(result)} AS JSONB), NOW())
      ON CONFLICT ("videoId") DO UPDATE SET
        "result" = EXCLUDED."result",
        "updatedAt" = NOW()
    `;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-summary-cache] Failed to persist summary.", error);
    }
  }
}

async function invalidateVideoSummaryCache(cacheKey: string): Promise<void> {
  videoSummaryCache.delete(cacheKey);
  try {
    await prisma.$executeRaw`
      DELETE FROM "video_summary_caches"
      WHERE "videoId" = ${cacheKey}
    `;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-summary-cache] Failed to invalidate cache row.", error);
    }
  }
}

async function getCachedVideoSummary(cacheKey: string): Promise<VideoSummaryResult | null> {
  const cached = videoSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (cached.result.segments.length === 0) {
      videoSummaryCache.delete(cacheKey);
    } else {
      return {
        ...cached.result,
        debug: { ...cached.result.debug, cacheStatus: "memory-hit" } as VideoSummaryResult["debug"],
      };
    }
  }

  const persisted = await readPersistedVideoSummary(cacheKey);
  if (!persisted || persisted.segments.length === 0) {
    return null;
  }

  videoSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + VIDEO_SUMMARY_CACHE_MS,
    result: persisted,
  });
  return {
    ...persisted,
    debug: { ...persisted.debug, cacheStatus: "persisted-hit" } as VideoSummaryResult["debug"],
  };
}

async function cacheVideoSummary(cacheKey: string, result: VideoSummaryResult): Promise<void> {
  videoSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + VIDEO_SUMMARY_CACHE_MS,
    result,
  });
  await writePersistedVideoSummary(cacheKey, result);
}

function compactSummaryFromSegments(segments: VideoSummarySegment[]): string {
  const top = segments.slice(0, 2).map((segment) => segment.title || segment.locationHints?.[0]).filter(Boolean) as string[];
  if (!top.length) {
    return "此影片整理了旅遊行程重點與景點片段。";
  }
  const sentence = `此影片重點包含${top.join("、")}等旅遊片段。`;
  return sentence.length <= 40 ? sentence : `${sentence.slice(0, 39)}…`;
}

function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

function formatTimestampFromSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safe / 60);
  const remainingSeconds = safe % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

export function buildDescriptionFallbackTranscriptEntries(input: {
  title: string;
  description: string;
}): TranscriptEntry[] {
  const chunks = [input.title, ...input.description.split(/\n{2,}/u)]
    .map((chunk) =>
      chunk
        .split(/\n/u)
        .map((line) => line.trim())
        .filter(Boolean)
        .join(" "),
    )
    .flatMap((chunk) => chunk.split(/(?<=[。！？!?])\s*|[•●◆◇▪︎✔✅🌟📍]/u))
    .map((chunk) => chunk.replace(/https?:\/\/\S+/gi, " ").replace(/#[\p{Letter}\p{Number}_-]+/gu, " ").trim())
    .filter((chunk) => !/(請(記得)?訂閱|別忘了|按讚|分享|小鈴鐺|合作邀約|商業合作|follow|instagram|facebook|music by|音樂)/i.test(chunk))
    .filter((chunk) => chunk.length >= 4 && chunk.length <= 120)
    .slice(0, 18);

  return chunks.map((text, index) => {
    const startSeconds = index * 60;
    return {
      timestamp: formatTimestampFromSeconds(startSeconds),
      startSeconds,
      durationSeconds: 45,
      text,
      timestampSource: "description-fallback",
      timestampConfidence: "low",
    };
  });
}

function toTimestamps(segments: VideoSummarySegment[]): Timestamp[] {
  return segments.map((segment) => ({
    time: segment.timestamp,
    label: segment.title || segment.text,
  }));
}

function deriveMapsProvenance(locations: Array<{ resolvedFrom?: string }>): VideoSummaryResult["mapsProvenance"] {
  const hasGeocode = locations.some((location) => location.resolvedFrom === "google-geocode");
  const hasFallback = locations.some((location) => location.resolvedFrom !== "google-geocode");
  if (hasGeocode && hasFallback) {
    return "mixed";
  }
  if (hasGeocode) {
    return "google-geocoding";
  }
  return "catalog-fallback";
}

export async function summarizeVideo(input: VideoSummaryInput): Promise<VideoSummaryResult> {
  const idFromField = input.videoId?.trim();
  const idFromUrl = extractYouTubeVideoId(input.url || "") || "";
  if (!idFromField && !idFromUrl) {
    throw new Error("INVALID_VIDEO_REFERENCE");
  }

  const videoId = idFromField || idFromUrl;
  const inputCacheKey = buildSummaryCacheKey({ videoId, destination: input.destination });
  if (input.refresh) {
    await invalidateVideoSummaryCache(inputCacheKey);
  }
  const inputVideoIdCache = input.refresh ? null : await getCachedVideoSummary(inputCacheKey);
  if (inputVideoIdCache) {
    return inputVideoIdCache;
  }

  const canonicalUrl = input.url?.trim() || `https://www.youtube.com/watch?v=${videoId}`;
  const metadata = await fetchYouTubeMetadata({
    url: canonicalUrl,
    title: input.title,
  });
  const resolvedVideoId = metadata.videoId || videoId;
  const resolvedCacheKeyEarly = buildSummaryCacheKey({
    videoId: resolvedVideoId,
    destination: input.destination,
  });
  if (input.refresh && resolvedCacheKeyEarly !== inputCacheKey) {
    await invalidateVideoSummaryCache(resolvedCacheKeyEarly);
  }

  if (resolvedVideoId !== videoId) {
    const resolvedVideoIdCache = input.refresh
      ? null
      : await getCachedVideoSummary(
          buildSummaryCacheKey({ videoId: resolvedVideoId, destination: input.destination }),
        );
    if (resolvedVideoIdCache) {
      return resolvedVideoIdCache;
    }
  }
  const resolvedCacheKey = resolvedCacheKeyEarly;

  const transcriptResult = await fetchYouTubeTranscript(resolvedVideoId);
  const descriptionFallbackEntries = buildDescriptionFallbackTranscriptEntries({
    title: metadata.title,
    description: metadata.description,
  });
  const transcriptEntries =
    transcriptResult.entries.length > 0
      ? [...transcriptResult.entries, ...descriptionFallbackEntries]
      : descriptionFallbackEntries;

  if (transcriptEntries.length === 0) {
    const unavailableReason = "無法取得逐字稿，暫時無法產生精準摘要。";
    const video: VideoRecommendation = {
      id: metadata.id,
      videoId: metadata.videoId,
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      url: metadata.url,
      duration: metadata.duration,
      summary: "",
      description: metadata.description,
      source: metadata.source,
      channelTitle: metadata.channelTitle,
      publishedAt: metadata.publishedAt,
      timestamps: [],
      summarySegments: [],
      extractedLocations: [],
    };

    const unavailableResult: VideoSummaryResult = {
      source: "youtube-summary-service",
      transcriptSource: "none",
      summarySource: "unavailable",
      segmentSource: "unavailable",
      title: metadata.title,
      summary: "",
      segments: [],
      extractedLocations: [],
      summaryUnavailable: true,
      unavailableReason,
      fallbackReason: transcriptResult.fallbackReason || unavailableReason,
      video,
      debug: {
        transcriptSource: "none",
        summarySource: "unavailable",
        segmentSource: "unavailable",
        captionLanguage: transcriptResult.captionLanguage,
        captionKind: transcriptResult.captionKind,
        captionSource: transcriptResult.captionSource,
        cacheStatus: "miss",
        pipelineVersion: VIDEO_PIPELINE_VERSION,
      },
    };

    await cacheVideoSummary(resolvedCacheKey, unavailableResult);

    return unavailableResult;
  }

  const transcriptSource: VideoSummaryDebugMeta["transcriptSource"] =
    transcriptResult.entries.length > 0 ? "youtube" : "fallback-description";
  const profile = selectTravelExtractionProfile({
    destinationHint: input.destination,
    transcriptLanguage: transcriptResult.captionLanguage,
    title: metadata.title,
    description: metadata.description,
  });
  const preprocessedLines = preprocessTranscript(transcriptEntries, profile, {
    captionLanguage: transcriptResult.captionLanguage,
  });
  const finalPlaceResult = await extractFinalVideoPlaces({
    transcriptLines: preprocessedLines,
    title: metadata.title,
    description: metadata.description,
    destinationHint: input.destination,
    enableGeocode: Boolean(serverConfig.googleMapsApiKey),
    enableSearch: serverConfig.searxngEnabled,
  });
  const finalPlaces = finalPlaceResult.places;
  const mapReadyLocations = dedupeLocationsByNormalizedName(
    finalPlaces.map((place) => {
      const fallbackLocation =
        place.lat !== undefined && place.lng !== undefined
          ? null
          : resolveLocationReference(place.name, input.destination);
      return {
        name: place.name,
        lat: place.lat ?? fallbackLocation?.lat ?? 0,
        lng: place.lng ?? fallbackLocation?.lng ?? 0,
        description: place.evidenceTexts[0] || `${place.name}，影片中提及的行程候選地點。`,
        address: place.address ?? fallbackLocation?.address,
        normalizedName: place.canonicalName,
        cleanedName: place.canonicalName,
        raw: place.aliases[0] || place.name,
        rawMention: place.aliases[0] || place.name,
        confidence: place.confidence,
        verified: place.source === "geocode" || place.source === "gazetteer",
        resolvedFrom: place.source === "geocode" ? "google-geocode" : "heuristic",
        sourceTranscriptLineIds: place.sourceTranscriptLineIds,
        extractionSource: "deterministic" as const,
      } satisfies LocationReference;
    }),
  ).slice(0, 16);
  const extractedLocationNames = mapReadyLocations.map((loc) => loc.name);
  const geocodeWarnings = finalPlaceResult.rejectedCandidates.length
    ? finalPlaceResult.rejectedCandidates
        .slice(0, 8)
        .map((candidate) => `${candidate.rawText}：${candidate.rejectedReason}`)
    : undefined;

  const deterministicSegments = buildSegmentsFromVerifiedPlaces({
    places: finalPlaces,
    videoDurationSeconds: parseDurationToSeconds(metadata.duration),
    maxSegments: 8,
  });
  const resolvedSegmentLocations = mergeVideoSummarySegmentsByStartSeconds(deterministicSegments).filter(
    (segment) => (segment.locationHints || []).length > 0,
  );
  const summary = compactSummaryFromSegments(resolvedSegmentLocations);
  const usedDescriptionFallback = transcriptSource === "fallback-description";
  const summarySource: VideoSummaryDebugMeta["summarySource"] = usedDescriptionFallback
    ? "ollama-description-fallback"
    : "heuristic-transcript-fallback";
  const segmentSource: VideoSummaryDebugMeta["segmentSource"] = usedDescriptionFallback
    ? "description-fallback"
    : "deterministic-mentions";

  const video: VideoRecommendation = {
    id: metadata.id,
    videoId: metadata.videoId,
    title: metadata.title,
    thumbnail: metadata.thumbnail,
    url: metadata.url,
    duration: metadata.duration,
    summary,
    description: metadata.description,
    source: metadata.source,
    channelTitle: metadata.channelTitle,
    publishedAt: metadata.publishedAt,
    timestamps: toTimestamps(resolvedSegmentLocations),
    summarySegments: resolvedSegmentLocations,
    extractedLocations: mapReadyLocations,
  };

  const result: VideoSummaryResult = {
    source: "youtube-summary-service",
    transcriptSource,
    summarySource,
    segmentSource,
    title: metadata.title,
    summary,
    segments: resolvedSegmentLocations,
    extractedLocations: extractedLocationNames,
    mapsProvenance: deriveMapsProvenance(mapReadyLocations),
    geocodeWarnings,
    fallbackReason:
      resolvedSegmentLocations.length === 0
        ? "無法建立穩定的重點片段，已套用 deterministic fallback。"
        : undefined,
    video,
    debug: {
      transcriptSource,
      summarySource,
      segmentSource,
      captionLanguage: transcriptResult.captionLanguage,
      captionKind: transcriptResult.captionKind,
      captionSource: transcriptResult.captionSource,
      cacheStatus: "miss",
      pipelineVersion: VIDEO_PIPELINE_VERSION,
      finalPlaceCount: finalPlaces.length,
      rejectedPlaceCandidateCount: finalPlaceResult.rejectedCandidates.length,
      placeExtractionPipelineVersion:
        (finalPlaceResult.debug as { placeExtractionPipelineVersion?: string } | undefined)?.placeExtractionPipelineVersion,
    },
  };

  await cacheVideoSummary(resolvedCacheKey, result);

  return result;
}
