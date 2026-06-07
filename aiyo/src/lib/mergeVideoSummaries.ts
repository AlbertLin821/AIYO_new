import { shouldSkipClientVideoSummarize } from "@/services/videoClient";
import type { VideoRecommendation, VideoSummaryResult } from "@/types";

function videoMatchKey(video: VideoRecommendation): string | null {
  const key = video.videoId?.trim() || video.id?.trim();
  return key || null;
}

function normalizedTitle(value?: string): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function shouldMergeProcessedVideoFields(
  incoming: VideoRecommendation,
  stored: VideoRecommendation,
): boolean {
  const incomingTitle = normalizedTitle(incoming.title);
  const storedTitle = normalizedTitle(stored.title);
  const titlesConflict = Boolean(incomingTitle && storedTitle && incomingTitle !== storedTitle);
  const storedIsDefaultSeed = stored.listProvenance === "default-taiwan-cities";
  const incomingIsDefaultSeed = incoming.listProvenance === "default-taiwan-cities";

  if (storedIsDefaultSeed && !incomingIsDefaultSeed && titlesConflict) {
    return false;
  }

  return true;
}

/** Merge a persisted video summary cache row into a recommendation list item. */
function pickNonEmptyArray<T>(incoming: T[] | undefined, fallback: T[] | undefined): T[] | undefined {
  if (incoming?.length) {
    return incoming;
  }
  if (fallback?.length) {
    return fallback;
  }
  return incoming ?? fallback;
}

/** Merge summarize API output into an existing list item without wiping prior pipeline fields. */
export function mergeVideoSummaryResult(
  existing: VideoRecommendation | undefined,
  incoming: VideoRecommendation,
  result?: Pick<VideoSummaryResult, "segments" | "summary" | "extractedFoods">,
): VideoRecommendation {
  const summarySegments = pickNonEmptyArray(
    incoming.summarySegments,
    pickNonEmptyArray(result?.segments, existing?.summarySegments),
  );
  const extractedLocations = pickNonEmptyArray(incoming.extractedLocations, existing?.extractedLocations);
  const extractedFoods = pickNonEmptyArray(
    incoming.extractedFoods,
    pickNonEmptyArray(result?.extractedFoods, existing?.extractedFoods),
  );
  const timestamps = pickNonEmptyArray(incoming.timestamps, existing?.timestamps);
  const summary =
    incoming.summary?.trim() || result?.summary?.trim() || existing?.summary?.trim() || incoming.summary;

  return {
    ...(existing ?? incoming),
    ...incoming,
    summary,
    summarySegments,
    extractedLocations: extractedLocations ?? incoming.extractedLocations ?? [],
    extractedFoods,
    timestamps: timestamps ?? incoming.timestamps ?? [],
  };
}

export function mergeCachedSummaryIntoVideo(
  video: VideoRecommendation,
  cached: VideoSummaryResult,
): VideoRecommendation {
  const processed = cached.video;
  const extractedLocations = processed.extractedLocations?.length
    ? processed.extractedLocations
    : video.extractedLocations;
  const summarySegments = processed.summarySegments?.length
    ? processed.summarySegments
    : cached.segments?.length
      ? cached.segments
      : video.summarySegments;

  if (!extractedLocations?.length && !summarySegments?.length && !cached.summary) {
    return video;
  }

  return {
    ...video,
    summary: cached.summary || video.summary,
    summarySegments,
    extractedLocations,
    extractedFoods: processed.extractedFoods?.length
      ? processed.extractedFoods
      : cached.extractedFoods?.length
        ? cached.extractedFoods
        : video.extractedFoods,
    timestamps: processed.timestamps?.length ? processed.timestamps : video.timestamps,
  };
}

/** 將 store 內已跑完摘要管線的欄位合併回推薦 API 回傳的影片列。 */
export function mergeProcessedVideoFields(
  incoming: VideoRecommendation,
  stored: VideoRecommendation,
): VideoRecommendation {
  if (!shouldSkipClientVideoSummarize(stored) || !shouldMergeProcessedVideoFields(incoming, stored)) {
    return incoming;
  }

  return {
    ...incoming,
    summary: stored.summary ?? incoming.summary,
    summarySegments: stored.summarySegments ?? incoming.summarySegments,
    extractedLocations: stored.extractedLocations?.length
      ? stored.extractedLocations
      : incoming.extractedLocations,
    extractedFoods: stored.extractedFoods?.length ? stored.extractedFoods : incoming.extractedFoods,
    timestamps: stored.timestamps?.length ? stored.timestamps : incoming.timestamps,
  };
}

export function mergeVideosWithStoredSummaries(
  incoming: VideoRecommendation[],
  stored: VideoRecommendation[],
): VideoRecommendation[] {
  if (incoming.length === 0 || stored.length === 0) {
    return incoming;
  }

  const storedByKey = new Map<string, VideoRecommendation>();
  for (const video of stored) {
    const key = videoMatchKey(video);
    if (key) {
      storedByKey.set(key, video);
    }
  }

  return incoming.map((video) => {
    const key = videoMatchKey(video);
    if (!key) {
      return video;
    }
    const existing = storedByKey.get(key);
    return existing ? mergeProcessedVideoFields(video, existing) : video;
  });
}
