import { isApiError } from "@/lib/api-response";
import type { ApiResponse } from "@/types";
import type { VideoRecommendation, VideoSummaryResult } from "@/types";

export type VideoSearchDebugInfo = {
  rawInput: string;
  searchQueries: string[];
  executedQueries: string[];
  regionCode: string;
  relevanceLanguage: string;
  selectedStrategy: "high-intent" | "literal-fallback";
  fallbackReasons: string[];
};

export type VideoRecommendationsClientResult = {
  videos: VideoRecommendation[];
  source: "youtube-data-api" | "mock-fallback";
  fallbackReason?: string;
  debug?: VideoSearchDebugInfo;
};

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchVideoRecommendations(input: {
  destination?: string;
  keyword?: string;
  days?: number;
  preferences?: string[];
  limit?: number;
}): Promise<VideoRecommendationsClientResult> {
  const params = new URLSearchParams();
  if (input.destination) {
    params.set("destination", input.destination);
  }
  if (input.keyword) {
    params.set("keyword", input.keyword);
  }
  if (input.days) {
    params.set("days", String(input.days));
  }
  if (input.preferences?.length) {
    params.set("preferences", input.preferences.join(","));
  }
  if (input.limit) {
    params.set("limit", String(input.limit));
  }

  const response = await fetch(`/api/videos/recommendations?${params.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  const payload = await parseJson<ApiResponse<VideoRecommendation[]> & { meta?: Record<string, unknown> }>(
    response,
  );

  if (!response.ok || isApiError(payload)) {
    throw new Error(
      isApiError(payload)
        ? payload.error.message
        : `Request failed with status ${response.status}`,
    );
  }

  const source = payload.meta?.source;
  const debug =
    payload.meta?.debug && typeof payload.meta.debug === "object"
      ? (payload.meta.debug as VideoSearchDebugInfo)
      : undefined;

  if (process.env.NODE_ENV !== "production" && debug) {
    console.info("[video-search]", {
      rawInput: debug.rawInput,
      searchQueries: debug.searchQueries,
      executedQueries: debug.executedQueries,
      regionCode: debug.regionCode,
      relevanceLanguage: debug.relevanceLanguage,
      selectedStrategy: debug.selectedStrategy,
      fallbackReasons: debug.fallbackReasons,
    });
  }

  return {
    videos: payload.data,
    source:
      source === "mock-fallback" || source === "youtube-data-api"
        ? source
        : "youtube-data-api",
    fallbackReason:
      typeof payload.meta?.fallbackReason === "string"
        ? payload.meta.fallbackReason
        : undefined,
    debug,
  };
}

export async function summarizeVideo(input: {
  url?: string;
  videoId?: string;
  title?: string;
  destination?: string;
}): Promise<VideoSummaryResult> {
  const response = await fetch("/api/videos/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await parseJson<ApiResponse<VideoSummaryResult>>(response);

  if (!response.ok || isApiError(payload)) {
    throw new Error(
      isApiError(payload)
        ? payload.error.message
        : `Request failed with status ${response.status}`,
    );
  }

  return payload.data;
}
