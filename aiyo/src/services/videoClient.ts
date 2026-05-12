import { isApiError } from "@/lib/api-response";
import type { ApiResponse } from "@/types";
import type { VideoRecommendation, VideoSummaryResult } from "@/types";

/** 客戶端已有可顯示的摘要資料時，略過 POST /api/videos/summarize 以縮短等待（伺服端仍會在必要時快取命中）。 */
export function shouldSkipClientVideoSummarize(video: VideoRecommendation): boolean {
  if (!video.videoId?.trim()) {
    return true;
  }
  if (video.listProvenance === "default-taiwan-cities") {
    return true;
  }
  const segments = video.summarySegments?.length ?? 0;
  const locations = video.extractedLocations?.length ?? 0;
  const stamps = video.timestamps?.length ?? 0;
  /** 不將僅有 description 剪貼的 `summary` 視為已分析：搜尋 API 影片常帶長篇說明但仍須跑摘要管線。 */
  return segments > 0 || locations > 0 || stamps > 0;
}

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
  /** 清除伺服端快取並強制重新分析（重新呼叫 AI／擷取管線） */
  refresh?: boolean;
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
