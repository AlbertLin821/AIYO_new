import { mockVideos } from "@/lib/mock-data";
import { serverConfig } from "@/server/config";
import {
  buildVideoRecommendationSearchQuery,
  isTravelRelatedVideo,
} from "@/server/providers/travelVideoFilter";
import { searchYouTubeVideos } from "@/server/providers/youtubeProvider";
import type { VideoRecommendation } from "@/types";

interface RecommendationInput {
  destination?: string;
  keyword?: string;
  limit?: number;
}

export type VideoRecommendationOutcome = {
  videos: VideoRecommendation[];
  source: "youtube-data-api" | "mock-fallback";
  fallbackReason?: string;
};

function scoreVideo(video: VideoRecommendation, input: RecommendationInput): number {
  const haystack = [
    video.title,
    video.summary,
    video.description,
    video.relevanceReason || "",
    video.channelTitle || "",
    ...video.extractedLocations.map((location) => location.name),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  if (input.destination && haystack.includes(input.destination.toLowerCase())) {
    score += 3;
  }
  if (input.keyword && haystack.includes(input.keyword.toLowerCase())) {
    score += 2;
  }
  return score;
}

function rankFallbackVideos(input: RecommendationInput): VideoRecommendation[] {
  const rawQ =
    buildVideoRecommendationSearchQuery({
      keyword: input.keyword,
      destination: input.destination,
    }) || "travel";
  return [...mockVideos]
    .map((video) => ({
      video: {
        ...video,
        source: "mock-fallback",
        listProvenance: "mock-fallback" as const,
      },
      score: scoreVideo(video, input),
    }))
    .filter((entry) =>
      isTravelRelatedVideo(
        {
          title: entry.video.title,
          description: entry.video.description,
          channelTitle: entry.video.channelTitle,
        },
        rawQ,
      ),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Math.min(input.limit || 6, 12)))
    .map((entry) => entry.video);
}

export async function getVideoRecommendations(
  input: RecommendationInput,
): Promise<VideoRecommendationOutcome> {
  if (serverConfig.enableMockVideoProvider) {
    const reason = "ENABLE_MOCK_VIDEO_PROVIDER is true; using local catalog.";
    console.warn(`[videoRecommendationService] ${reason}`);
    return {
      videos: rankFallbackVideos(input),
      source: "mock-fallback",
      fallbackReason: reason,
    };
  }

  try {
    const providerResult = await searchYouTubeVideos(input);
    if (providerResult.provider === "youtube-data-api" && providerResult.videos.length > 0) {
      return {
        videos: providerResult.videos,
        source: "youtube-data-api",
      };
    }

    const reason =
      providerResult.fallbackReason || "YouTube Data API 未回傳可用結果。";
    console.warn(`[videoRecommendationService] No YouTube results: ${reason}`);
    if (serverConfig.enableMockVideoProvider) {
      return {
        videos: rankFallbackVideos(input),
        source: "mock-fallback",
        fallbackReason: reason,
      };
    }
    return {
      videos: [],
      source: "youtube-data-api",
      fallbackReason: reason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown YouTube API error.";
    console.warn(`[videoRecommendationService] YouTube API error: ${message}`);
    if (serverConfig.enableMockVideoProvider) {
      return {
        videos: rankFallbackVideos(input),
        source: "mock-fallback",
        fallbackReason: message,
      };
    }
    return {
      videos: [],
      source: "youtube-data-api",
      fallbackReason: message,
    };
  }
}
