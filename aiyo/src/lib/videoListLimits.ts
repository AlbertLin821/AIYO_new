import type { VideoRecommendation } from "@/types";

/** 首頁／聊天推薦區在未按「更多影片」前的顯示上限 */
export const INITIAL_VIDEO_RECOMMENDATIONS_LIMIT = 6;

export function limitInitialVideoRecommendations(
  videos: VideoRecommendation[],
): VideoRecommendation[] {
  return videos.slice(0, INITIAL_VIDEO_RECOMMENDATIONS_LIMIT);
}

export function dedupeVideoRecommendations(
  existing: VideoRecommendation[],
  incoming: VideoRecommendation[],
): VideoRecommendation[] {
  const seen = new Set(
    existing.map((video) => (video.videoId || video.id || "").trim()).filter(Boolean),
  );
  const merged = [...existing];
  for (const video of incoming) {
    const key = (video.videoId || video.id || "").trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(video);
  }
  return merged;
}
