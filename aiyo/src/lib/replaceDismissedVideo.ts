import { mergeVideosWithStoredSummaries } from "@/lib/mergeVideoSummaries";
import { fetchVideoRecommendations } from "@/services/videoClient";
import type { VideoRecommendation } from "@/types";

export type VideoRecommendationRequest = {
  destination?: string;
  keyword?: string;
  days?: number;
  preferences?: string[];
  limit?: number;
};

export function collectVideoIdentityIds(
  videos: VideoRecommendation[],
  extraIds: string[] = [],
): string[] {
  const ids = new Set<string>();
  for (const video of videos) {
    const key = (video.videoId || video.id || "").trim();
    if (key) {
      ids.add(key);
    }
  }
  for (const id of extraIds) {
    const key = id.trim();
    if (key) {
      ids.add(key);
    }
  }
  return Array.from(ids);
}

/** 取得一支未出現在 exclude 清單中的替換影片（與「更多影片」相同 API 路徑）。 */
export async function fetchReplacementVideo(input: {
  baseRequest: VideoRecommendationRequest;
  excludeVideoIds: string[];
  mergeFromVideos?: VideoRecommendation[];
}): Promise<VideoRecommendation | null> {
  const outcome = await fetchVideoRecommendations({
    ...input.baseRequest,
    limit: 1,
    excludeVideoIds: input.excludeVideoIds,
  });

  const excluded = new Set(input.excludeVideoIds.map((id) => id.trim()).filter(Boolean));
  const candidate = outcome.videos.find((video) => {
    const key = (video.videoId || video.id || "").trim();
    return Boolean(key) && !excluded.has(key);
  });

  if (!candidate) {
    return null;
  }

  if (input.mergeFromVideos?.length) {
    const [merged] = mergeVideosWithStoredSummaries([candidate], input.mergeFromVideos);
    return merged ?? candidate;
  }

  return candidate;
}
