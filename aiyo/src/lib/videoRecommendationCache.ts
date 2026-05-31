import type { VideoRecommendation } from "@/types";

export type VideoRecommendationRequestInput = {
  destination?: string;
  keyword?: string;
  days?: number;
  preferences?: string[];
  limit?: number;
  offset?: number;
  excludeVideoIds?: string[];
};

export type CachedVideoRecommendations = {
  videos: VideoRecommendation[];
  source: "youtube-data-api" | "mock-fallback" | "preloaded-destination-seed";
  fallbackReason?: string;
  fetchedAt: number;
};

export const VIDEO_RECOMMENDATION_CACHE_TTL_MS = 5 * 60 * 1000;

export function buildRecommendationQueryKey(input: VideoRecommendationRequestInput): string {
  const excludeIds = [...(input.excludeVideoIds || [])].map((id) => id.trim()).filter(Boolean).sort();
  return [
    input.destination?.trim() || "",
    input.keyword?.trim() || "",
    input.days ?? "",
    (input.preferences || []).join(","),
    input.limit ?? 6,
    input.offset ?? 0,
    excludeIds.join(","),
  ].join("|");
}

export function isRecommendationCacheFresh(entry: CachedVideoRecommendations, now = Date.now()): boolean {
  return now - entry.fetchedAt < VIDEO_RECOMMENDATION_CACHE_TTL_MS;
}
