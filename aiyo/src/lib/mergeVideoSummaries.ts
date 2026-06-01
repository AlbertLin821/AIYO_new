import { shouldSkipClientVideoSummarize } from "@/services/videoClient";
import type { VideoRecommendation } from "@/types";

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
