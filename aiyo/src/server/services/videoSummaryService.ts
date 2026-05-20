import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { serverConfig } from "@/server/config";
import { findKnownLocationReference } from "@/server/geo/locationCatalog";
import { geocodeWithGoogle } from "@/server/geo/geocodeService";
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
import {
  extractSimpleVideoPlacesAndFoods,
  type SimpleExtractedFood,
  type SimpleExtractedPlace,
} from "@/server/video/simpleExtraction";
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

const VIDEO_PIPELINE_VERSION =
  serverConfig.videoExtractionMode === "simple-ollama" ? "video-simple-ollama-v2" : "video-quality-v7";
const NO_VERIFIED_PLACES_MESSAGE = "此影片未擷取到足夠明確且可驗證的地點名稱。";
const NO_SIMPLE_RESULTS_MESSAGE = "此影片未擷取到明確地點或食物名稱。";

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

function compactSummaryFromSimpleExtraction(input: {
  places: SimpleExtractedPlace[];
  foods: SimpleExtractedFood[];
}): string {
  const placeNames = input.places.map((place) => place.name).slice(0, 3);
  const foodNames = input.foods.map((food) => food.name).slice(0, 3);

  if (placeNames.length === 0 && foodNames.length === 0) {
    return NO_SIMPLE_RESULTS_MESSAGE;
  }
  if (placeNames.length > 0 && foodNames.length > 0) {
    return `影片提到${placeNames.join("、")}等地點，以及${foodNames.join("、")}等食物。`;
  }
  if (placeNames.length > 0) {
    return `影片提到${placeNames.join("、")}等地點。`;
  }
  return `影片提到${foodNames.join("、")}等食物。`;
}

function buildSimpleSegments(input: {
  places: SimpleExtractedPlace[];
  foods: SimpleExtractedFood[];
}): VideoSummarySegment[] {
  const timedPlaces = input.places
    .filter((place) => typeof place.startSeconds === "number")
    .sort((left, right) => (left.startSeconds as number) - (right.startSeconds as number))
    .slice(0, 8);

  return timedPlaces.map((place, index) => {
    const startSeconds = Math.max(0, Math.floor(place.startSeconds || 0));
    const relatedFoods = input.foods
      .filter((food) => typeof food.startSeconds === "number")
      .filter((food) => Math.abs((food.startSeconds as number) - startSeconds) <= 90)
      .map((food) => food.name)
      .slice(0, 4);

    return {
      id: `simple_segment_${index + 1}`,
      timestamp: formatTimestampFromSeconds(startSeconds),
      startLabel: formatTimestampFromSeconds(startSeconds),
      startSeconds,
      endSeconds: startSeconds + 30,
      title: place.name,
      text: place.evidence || `影片提到 ${place.name}`,
      summary: place.evidence || `影片提到 ${place.name}`,
      locationHints: [place.name],
      foods: relatedFoods,
      timestampSource: "youtube-transcript",
      timestampConfidence: "high",
      extractionSource: "ai-polished",
    };
  });
}

async function buildSimpleMapReadyLocations(input: {
  places: SimpleExtractedPlace[];
  destinationHint?: string;
}): Promise<LocationReference[]> {
  const out: LocationReference[] = [];

  for (const place of input.places.slice(0, 16)) {
    const description = place.evidence || `${place.name}，影片中提到的地點。`;
    const known = findKnownLocationReference(place.name, description);

    if (serverConfig.googleMapsApiKey) {
      const geocode = await geocodeWithGoogle(place.name, input.destinationHint);
      if (geocode.ok) {
        out.push({
          name: place.name,
          lat: geocode.result.lat,
          lng: geocode.result.lng,
          description,
          address: geocode.result.formattedAddress,
          placeId: geocode.result.placeId,
          rawQuery: place.name,
          raw: place.name,
          normalized: place.name,
          normalizedName: place.name,
          cleanedName: place.name,
          rawMention: place.name,
          confidence: 0.78,
          verified: true,
          resolvedFrom: "google-geocode",
          extractionSource: "ai-polished",
        });
        continue;
      }
    }

    if (!known) {
      continue;
    }

    out.push({
      ...known,
      name: place.name,
      description,
      rawQuery: place.name,
      raw: place.name,
      normalized: place.name,
      normalizedName: place.name,
      cleanedName: place.name,
      rawMention: place.name,
      confidence: 0.42,
      verified: false,
      resolvedFrom: "llm",
      extractionSource: "ai-polished",
    });
  }

  return dedupeLocationsByNormalizedName(out);
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
      extractedFoods: [],
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
      extractedFoods: [],
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
  if (serverConfig.videoExtractionMode === "simple-ollama") {
    const simpleResult = await extractSimpleVideoPlacesAndFoods({
      title: metadata.title,
      description: metadata.description,
      transcriptLines: preprocessedLines,
    });
    const extractedLocationNames = simpleResult.places.map((place) => place.name);
    const extractedFoodNames = simpleResult.foods.map((food) => food.name);
    const mapReadyLocations = await buildSimpleMapReadyLocations({
      places: simpleResult.places,
      destinationHint: input.destination,
    });
    const resolvedSegments = buildSimpleSegments({
      places: simpleResult.places,
      foods: simpleResult.foods,
    });
    const summary = compactSummaryFromSimpleExtraction({
      places: simpleResult.places,
      foods: simpleResult.foods,
    });
    const summarySource: VideoSummaryDebugMeta["summarySource"] =
      transcriptSource === "fallback-description" ? "ollama-description-fallback" : "ollama-transcript";
    const segmentSource: VideoSummaryDebugMeta["segmentSource"] = "transcript-chunks";

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
      timestamps: toTimestamps(resolvedSegments),
      summarySegments: resolvedSegments,
      extractedLocations: mapReadyLocations,
      extractedFoods: extractedFoodNames,
    };

    const result: VideoSummaryResult = {
      source: "youtube-summary-service",
      transcriptSource,
      summarySource,
      segmentSource,
      title: metadata.title,
      summary,
      segments: resolvedSegments,
      extractedLocations: extractedLocationNames,
      extractedFoods: extractedFoodNames,
      mapsProvenance: mapReadyLocations.length > 0 ? deriveMapsProvenance(mapReadyLocations) : undefined,
      fallbackReason:
        simpleResult.debug?.failedChunkCount
          ? `部分字幕片段分析逾時或失敗，已保留成功片段。失敗片段數：${simpleResult.debug.failedChunkCount}。`
          : extractedLocationNames.length === 0 && extractedFoodNames.length === 0
            ? NO_SIMPLE_RESULTS_MESSAGE
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
        finalPlaceCount: simpleResult.debug?.finalPlaceCount,
        finalFoodCount: simpleResult.debug?.finalFoodCount,
        failedChunkCount: simpleResult.debug?.failedChunkCount,
      },
    };

    await cacheVideoSummary(resolvedCacheKey, result);
    return result;
  }
  const finalPlaceResult = await extractFinalVideoPlaces({
    transcriptLines: preprocessedLines,
    title: metadata.title,
    description: metadata.description,
    destinationHint: input.destination,
    enableGeocode: Boolean(serverConfig.googleMapsApiKey),
    enableSearch: serverConfig.searxngEnabled,
  });
  const finalPlaces = finalPlaceResult.places;
  /** 正式 UI：不含僅 heuristic 通過的地點（需 VIDEO_PLACE_ALLOW_HEURISTIC_FALLBACK 才可能進入 pipeline）。 */
  const formalUiPlaces = finalPlaces.filter((place) => place.source !== "heuristic");
  const mapReadyLocations =
    formalUiPlaces.length === 0
      ? []
      : dedupeLocationsByNormalizedName(
          formalUiPlaces
            .filter((place) => Number.isFinite(place.lat) && Number.isFinite(place.lng))
            .map((place) => ({
              name: place.name,
              lat: place.lat as number,
              lng: place.lng as number,
              description: place.evidenceTexts[0] || `${place.name}，影片中提及的行程候選地點。`,
              address: place.address,
              normalizedName: place.canonicalName,
              cleanedName: place.canonicalName,
              raw: place.aliases[0] || place.name,
              rawMention: place.aliases[0] || place.name,
              confidence: place.confidence,
              verified: place.source === "geocode" || place.source === "gazetteer",
              resolvedFrom: place.source === "geocode" ? ("google-geocode" as const) : ("heuristic" as const),
              sourceTranscriptLineIds: place.sourceTranscriptLineIds,
              extractionSource: "deterministic" as const,
            })),
        ).slice(0, 16);
  const extractedLocationNames = formalUiPlaces.map((place) => place.name);
  const geocodeWarnings = finalPlaceResult.rejectedCandidates.length
    ? finalPlaceResult.rejectedCandidates
        .slice(0, 8)
        .map((candidate) => `${candidate.rawText}：${candidate.rejectedReason}`)
    : undefined;

  const deterministicSegments =
    formalUiPlaces.length === 0
      ? []
      : buildSegmentsFromVerifiedPlaces({
          places: formalUiPlaces,
          videoDurationSeconds: parseDurationToSeconds(metadata.duration),
          maxSegments: 8,
        });
  const resolvedSegmentLocations = mergeVideoSummarySegmentsByStartSeconds(deterministicSegments).filter(
    (segment) => (segment.locationHints || []).length > 0,
  );
  const summary =
    formalUiPlaces.length === 0 ? NO_VERIFIED_PLACES_MESSAGE : compactSummaryFromSegments(resolvedSegmentLocations);
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
    extractedFoods: [],
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
    extractedFoods: [],
    mapsProvenance: deriveMapsProvenance(mapReadyLocations),
    geocodeWarnings,
    fallbackReason:
      formalUiPlaces.length === 0
        ? NO_VERIFIED_PLACES_MESSAGE
        : resolvedSegmentLocations.length === 0
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
      finalFoodCount: 0,
      rejectedPlaceCandidateCount: finalPlaceResult.rejectedCandidates.length,
      placeExtractionPipelineVersion:
        (finalPlaceResult.debug as { placeExtractionPipelineVersion?: string } | undefined)?.placeExtractionPipelineVersion,
    },
  };

  await cacheVideoSummary(resolvedCacheKey, result);

  return result;
}
