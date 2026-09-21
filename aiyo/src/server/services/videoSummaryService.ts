import { buildGroundedVideoOverview } from "@/server/video/groundedVideoOverview";
import type { VideoJobProgress } from "@/lib/videoJob";
import { randomUUID } from "crypto";
import "@/server/bootstrap/videoPipelineBootstrap";
import {
  extractYouTubeVideoId,
  fetchYouTubeMetadata,
  fetchYouTubeTranscript,

} from "@/server/providers/youtubeProvider";
import { prisma } from "@/lib/prisma";
import { serverConfig } from "@/server/config";
import { findKnownLocationReference } from "@/server/geo/locationCatalog";
import { createVideoPlaceResolver, type VideoPlaceResolver } from "@/server/video/videoPlaceResolver";
import { mapGeocodedPlaceResolvedFrom } from "@/server/places/geocodePlace";
import {
  inferTripDestinationLabelFromVideoMetadata,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import { extractFinalVideoPlaces } from "@/server/video/placeExtraction";
import {
  extractSimpleVideoPlacesAndFoods,
  type SimpleExtractedPlace,
} from "@/server/video/simpleExtraction";
import { buildGroundedVideoSegments } from "@/server/video/groundedVideoSegments";
import { preprocessTranscript } from "@/server/video/transcriptProcessing";
import { syncExtractedLocationsWithSegments } from "@/server/video/syncExtractedLocationsWithSegments";
import {
  selectTravelExtractionProfile,
  type TravelExtractionProfile,
} from "@/server/video/travelExtractionProfiles";
import type {
  LocationReference,
  Timestamp,
  VideoRecommendation,
  VideoSummaryDebugMeta,
  VideoSummaryResult,
  VideoSummarySegment,
} from "@/types";

export const VIDEO_PIPELINE_VERSION =
  serverConfig.videoExtractionMode === "simple-ollama" ? "video-simple-ollama-v9" : "video-quality-v13";
const NO_VERIFIED_PLACES_MESSAGE = "此影片未擷取到足夠明確且可驗證的地點名稱。";
const NO_SIMPLE_RESULTS_MESSAGE = "此影片未擷取到明確地點或食物名稱。";

function scopesShareCountryCode(
  left: TripDestinationScope | null | undefined,
  right: TripDestinationScope | null | undefined,
): boolean {
  const leftCodes = left?.countryCodes?.filter(Boolean) ?? [];
  const rightCodes = right?.countryCodes?.filter(Boolean) ?? [];
  if (leftCodes.length === 0 || rightCodes.length === 0) {
    return false;
  }
  return leftCodes.some((code) => rightCodes.includes(code));
}

export function resolveVideoSummaryDestinationContext(input: {
  destinationHint?: string;
  transcriptLanguage?: string;
  title?: string;
  description?: string;
}): {
  profile: TravelExtractionProfile;
  destinationHint?: string;
  destinationScope: TripDestinationScope | null;
} {
  // User trip destination must not override video metadata when picking extraction profile.
  const profile = selectTravelExtractionProfile({
    transcriptLanguage: input.transcriptLanguage,
    title: input.title,
    description: input.description,
  });
  const metadataLabel = inferTripDestinationLabelFromVideoMetadata({
    title: input.title,
    description: input.description,
  });
  const videoScopeFromMetadata = metadataLabel ? resolveTripDestinationScope(metadataLabel) : null;
  const videoScopeFromProfile =
    profile.country && profile.country !== "Global"
      ? resolveTripDestinationScope(profile.country)
      : null;
  const videoScope =
    videoScopeFromMetadata?.countryCodes.length
      ? videoScopeFromMetadata
      : videoScopeFromProfile;
  const userDestination = input.destinationHint?.trim() || "";
  const userScope = userDestination ? resolveTripDestinationScope(userDestination) : null;

  if (videoScope?.countryCodes.length && userScope?.countryCodes.length) {
    if (!scopesShareCountryCode(userScope, videoScope)) {
      return {
        profile,
        destinationHint: metadataLabel || profile.country || videoScope.canonicalLabel,
        destinationScope: videoScope,
      };
    }
    return {
      profile,
      destinationHint: userDestination || metadataLabel || profile.country || undefined,
      destinationScope: userScope,
    };
  }

  if (videoScope?.countryCodes.length) {
    return {
      profile,
      destinationHint: metadataLabel || profile.country || videoScope.canonicalLabel,
      destinationScope: videoScope,
    };
  }

  if (userScope) {
    return {
      profile,
      destinationHint: userDestination || profile.country || undefined,
      destinationScope: userScope,
    };
  }

  return {
    profile,
    destinationHint: metadataLabel || profile.country || undefined,
    destinationScope: videoScopeFromProfile,
  };
}

export function isCatalogLocationAllowedForVideoScope(
  location: Pick<LocationReference, "name" | "address" | "description">,
  destinationScope?: TripDestinationScope | null,
): boolean {
  if (!destinationScope?.countryCodes.length) {
    return true;
  }

  const haystack = [location.name, location.address, location.description].filter(Boolean).join(" ");
  return isTextInTripDestinationScope(haystack, destinationScope, { strictCountryLevel: true });
}

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
  onProgress?: (progress: VideoJobProgress) => Promise<void>;
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

export function buildSummaryCacheKey(input: { videoId: string; language?: string }): string {
  return [
    VIDEO_PIPELINE_VERSION,
    input.videoId.trim(),
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

function purgeMemoryVideoSummaryCacheForVideoId(youtubeVideoId: string): void {
  const trimmed = youtubeVideoId.trim();
  if (!trimmed) {
    return;
  }
  const needle = `:${trimmed}:`;
  for (const key of videoSummaryCache.keys()) {
    if (key.includes(needle)) {
      videoSummaryCache.delete(key);
    }
  }
}

/** Remove every persisted/memory cache row for a YouTube id (all destination variants). */
async function invalidateAllVideoSummaryCachesForVideoId(youtubeVideoId: string): Promise<void> {
  const trimmed = youtubeVideoId.trim();
  if (!trimmed) {
    return;
  }
  purgeMemoryVideoSummaryCacheForVideoId(trimmed);
  try {
    await prisma.$executeRaw`
      DELETE FROM "video_summary_caches"
      WHERE "videoId" LIKE ${`%:${trimmed}:%`}
    `;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-summary-cache] Failed to invalidate all cache rows for video.", error);
    }
  }
}

export function isAcceptableVideoSummaryCache(result: VideoSummaryResult): boolean {
  // Legacy destination keys must not resurrect results from older validation rules.
  if (result.debug?.pipelineVersion !== VIDEO_PIPELINE_VERSION) {
    return false;
  }
  if (result.segments.length === 0) {
    return false;
  }
  if ((result.debug?.failedChunkCount ?? 0) > 0) {
    return false;
  }
  return true;
}

/** Load cached summary by YouTube id (canonical key first, then legacy destination-scoped rows). */
export async function getCachedVideoSummaryForVideoId(
  youtubeVideoId: string,
  language = "zh-Hant",
): Promise<VideoSummaryResult | null> {
  const trimmed = youtubeVideoId.trim();
  if (!trimmed) {
    return null;
  }

  const canonicalKey = buildSummaryCacheKey({ videoId: trimmed, language });
  const canonicalHit = await getCachedVideoSummary(canonicalKey);
  if (canonicalHit) {
    return canonicalHit;
  }

  try {
    const rows = await prisma.$queryRaw<VideoSummaryCacheRow[]>`
      SELECT "result"
      FROM "video_summary_caches"
      WHERE "videoId" LIKE ${`%:${trimmed}:%`}
      ORDER BY "updatedAt" DESC
      LIMIT 5
    `;
    for (const row of rows) {
      const result = row.result;
      if (isVideoSummaryResult(result) && isAcceptableVideoSummaryCache(result)) {
        videoSummaryCache.set(canonicalKey, {
          expiresAt: Date.now() + VIDEO_SUMMARY_CACHE_MS,
          result,
        });
        return {
          ...result,
          debug: {
            ...result.debug,
            cacheStatus: "persisted-hit-legacy",
          } as VideoSummaryResult["debug"],
        };
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-summary-cache] Failed legacy cache lookup.", error);
    }
  }

  return null;
}

async function getCachedVideoSummary(cacheKey: string): Promise<VideoSummaryResult | null> {
  const cached = videoSummaryCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    if (!isAcceptableVideoSummaryCache(cached.result)) {
      videoSummaryCache.delete(cacheKey);
    } else {
      return {
        ...cached.result,
        debug: { ...cached.result.debug, cacheStatus: "memory-hit" } as VideoSummaryResult["debug"],
      };
    }
  }

  const persisted = await readPersistedVideoSummary(cacheKey);
  if (!persisted || !isAcceptableVideoSummaryCache(persisted)) {
    if (persisted && !isAcceptableVideoSummaryCache(persisted)) {
      await invalidateVideoSummaryCache(cacheKey);
    }
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
  if (!isAcceptableVideoSummaryCache(result)) {
    return;
  }
  videoSummaryCache.set(cacheKey, {
    expiresAt: Date.now() + VIDEO_SUMMARY_CACHE_MS,
    result,
  });
  await writePersistedVideoSummary(cacheKey, result);
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

async function buildSimpleMapReadyLocations(input: {
  places: SimpleExtractedPlace[];
  resolvePlace: VideoPlaceResolver;
  destinationHint?: string;
  destinationScope?: TripDestinationScope | null;
}): Promise<LocationReference[]> {
  const results = await Promise.allSettled(input.places.slice(0, 16).map(async (place): Promise<LocationReference | null> => {
    const description = place.evidence || `${place.name}，影片中提到的地點。`;
    const known = findKnownLocationReference(place.name, description);

    const geocoded = await input.resolvePlace(place.name);
    if (geocoded.ok) {
      return {
          name: place.name,
          lat: geocoded.place.lat,
          lng: geocoded.place.lng,
          description,
          address: geocoded.place.formattedAddress ?? undefined,
          placeId: geocoded.place.placeId ?? undefined,
          rawQuery: place.name,
          raw: place.name,
          normalized: place.name,
          normalizedName: place.name,
          cleanedName: place.name,
          rawMention: place.name,
          confidence: geocoded.place.confidence ?? 0.78,
          verified: true,
          resolvedFrom: mapGeocodedPlaceResolvedFrom(geocoded.place.provider),
          extractionSource: "ai-polished",
        };
    }

    if (!known || !isCatalogLocationAllowedForVideoScope(known, input.destinationScope)) {
      return null;
    }

    return {
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
    };
  }));
  const locations = results.flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : []);
  return dedupeLocationsByNormalizedName(locations);
}

export async function summarizeVideo(input: VideoSummaryInput): Promise<VideoSummaryResult> {
  const idFromField = input.videoId?.trim();
  const idFromUrl = extractYouTubeVideoId(input.url || "") || "";
  if (!idFromField && !idFromUrl) {
    throw new Error("INVALID_VIDEO_REFERENCE");
  }

  const videoId = idFromField || idFromUrl;
  if (input.refresh) {
    await invalidateAllVideoSummaryCachesForVideoId(videoId);
  }
  const inputVideoIdCache = input.refresh ? null : await getCachedVideoSummaryForVideoId(videoId);
  if (inputVideoIdCache) {
    return inputVideoIdCache;
  }

  await input.onProgress?.({ phase: "metadata", label: "讀取影片資訊", percent: 10 });
  const canonicalUrl = input.url?.trim() || `https://www.youtube.com/watch?v=${videoId}`;
  const metadata = await fetchYouTubeMetadata({
    url: canonicalUrl,
    title: input.title,
  });
  const resolvedVideoId = metadata.videoId || videoId;
  if (input.refresh && resolvedVideoId !== videoId) {
    await invalidateAllVideoSummaryCachesForVideoId(resolvedVideoId);
  }

  if (resolvedVideoId !== videoId) {
    const resolvedVideoIdCache = input.refresh
      ? null
      : await getCachedVideoSummaryForVideoId(resolvedVideoId);
    if (resolvedVideoIdCache) {
      return resolvedVideoIdCache;
    }
  }
  const resolvedCacheKey = buildSummaryCacheKey({ videoId: resolvedVideoId });
  await input.onProgress?.({ phase: "transcript", label: "取得影片字幕", percent: 25 });
  const transcriptResult = await fetchYouTubeTranscript(resolvedVideoId);
  // Metadata remains extraction context, never a synthetic timed transcript.
  const transcriptEntries = transcriptResult.entries;

  if (transcriptEntries.length === 0 && !metadata.description.trim()) {
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
  const destinationContext = resolveVideoSummaryDestinationContext({
    destinationHint: input.destination,
    transcriptLanguage: transcriptResult.captionLanguage,
    title: metadata.title,
    description: metadata.description,
  });
  const profile = destinationContext.profile;
  const destinationHint = destinationContext.destinationHint;
  const destinationScope = destinationContext.destinationScope;
  const preprocessedLines = preprocessTranscript(transcriptEntries, profile, {
    captionLanguage: transcriptResult.captionLanguage,
  });
  await input.onProgress?.({ phase: "extract", label: "整理字幕與旅遊重點", percent: 45 });
  if (serverConfig.videoExtractionMode === "simple-ollama") {
    const simpleResult = await extractSimpleVideoPlacesAndFoods({
      title: metadata.title,
      description: metadata.description,
      transcriptLines: preprocessedLines,
      destinationHint,
      transcriptLanguage: transcriptResult.captionLanguage,
    });
    const extractedFoodNames = simpleResult.foods.map((food) => food.name);
    const resolvedSegments = buildGroundedVideoSegments({
      places: simpleResult.places,
      foods: simpleResult.foods,
      transcriptLines: preprocessedLines,
    });
    await input.onProgress?.({ phase: "locations", label: "核對地點與地圖位置", percent: 80 });
    const resolvePlace = createVideoPlaceResolver({ destinationHint, destinationScope });
    const mapReadyLocations = await buildSimpleMapReadyLocations({
      resolvePlace,
      places: simpleResult.places,
      destinationHint,
      destinationScope,
    });
    const syncedLocations = await syncExtractedLocationsWithSegments({
      resolvePlace,
      segments: resolvedSegments,
      mapReadyLocations,
      destinationHint,
      destinationScope,
    });
    const extractedLocationNames = syncedLocations.map((place) => place.name);
    const summary = buildGroundedVideoOverview({
      segments: resolvedSegments, places: simpleResult.places.map((place) => place.name),
      foods: extractedFoodNames, description: metadata.description,
      transcriptAvailable: transcriptSource === "youtube",
    });
    const summarySource: VideoSummaryDebugMeta["summarySource"] =
      transcriptSource === "fallback-description" ? "ollama-description-fallback" : "ollama-transcript";
    const segmentSource: VideoSummaryDebugMeta["segmentSource"] =
      transcriptSource === "fallback-description" ? "description-fallback" : "transcript-chunks";

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
      extractedLocations: syncedLocations,
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
      mapsProvenance: syncedLocations.length > 0 ? deriveMapsProvenance(syncedLocations) : undefined,
      fallbackReason:
        transcriptSource === "fallback-description"
          ? transcriptResult.fallbackReason || "無法取得逐字稿，以下根據影片描述欄整理，時間與片段僅供參考。"
          : simpleResult.debug?.failedChunkCount &&
              resolvedSegments.length === 0 &&
              extractedLocationNames.length === 0 &&
              extractedFoodNames.length === 0
          ? `部分字幕片段分析逾時或失敗，未能擷取地點與片段。失敗片段數：${simpleResult.debug.failedChunkCount}。`
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
        ...(simpleResult.debug?.failedChunks?.length
          ? {
              placeExtractionPipelineVersion: simpleResult.debug.failedChunks
                .map((chunk) => `chunk${chunk.chunkIndex}:${chunk.reason}`)
                .join(" | ")
                .slice(0, 280),
            }
          : {}),
      },
    };

    await cacheVideoSummary(resolvedCacheKey, result);

    return result;
  }
  const finalPlaceResult = await extractFinalVideoPlaces({
    transcriptLines: preprocessedLines,
    title: metadata.title,
    description: metadata.description,
    destinationHint,
    destinationScope,
    enableGeocode: true,
    enableSearch:
      serverConfig.aiWebSearchEnabled &&
      Boolean(serverConfig.serperApiKey.trim() || serverConfig.tavilyApiKey.trim()),
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

  const resolvedSegmentLocations = buildGroundedVideoSegments({
    places: formalUiPlaces.map((place) => ({ name: place.name, startSeconds: place.firstMentionStartSeconds })),
    foods: [],
    transcriptLines: preprocessedLines,
  });
  const summary = buildGroundedVideoOverview({
    segments: resolvedSegmentLocations, places: extractedLocationNames, foods: [],
    description: metadata.description, transcriptAvailable: transcriptSource === "youtube",
  });
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

/** 將既有摘要結果寫入快取（僅在 segments 非空時）。供種子補齊腳本使用。 */
export async function persistVideoSummaryFromInput(
  input: { videoId: string; destination?: string },
  result: VideoSummaryResult,
): Promise<void> {
  if (!result.segments.length) {
    return;
  }
  const videoId = extractYouTubeVideoId(input.videoId) || input.videoId.trim();
  const resolvedCacheKey = buildSummaryCacheKey({
    videoId,
    language: "zh-Hant",
  });
  await cacheVideoSummary(resolvedCacheKey, result);
}
