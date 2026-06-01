import { isApiError } from "@/lib/api-response";
import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  startFrontendDebugProcess,
  updateFrontendDebugProcess,
} from "@/lib/frontendDebug";
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
  const foods = video.extractedFoods?.length ?? 0;
  const stamps = video.timestamps?.length ?? 0;
  /** 不將僅有 description 剪貼的 `summary` 視為已分析：搜尋 API 影片常帶長篇說明但仍須跑摘要管線。 */
  return segments > 0 || locations > 0 || foods > 0 || stamps > 0;
}

export type VideoSearchDebugInfo = {
  rawInput: string;
  searchQueries: string[];
  executedQueries: string[];
  regionCode: string;
  relevanceLanguage: string;
  selectedStrategy: "high-intent" | "literal-fallback" | "preloaded-seed";
  fallbackReasons: string[];
};

export type VideoRecommendationsClientResult = {
  videos: VideoRecommendation[];
  source: "youtube-data-api" | "mock-fallback" | "preloaded-destination-seed";
  fallbackReason?: string;
  debug?: VideoSearchDebugInfo;
};

async function parseJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

export async function fetchVideoRecommendations(
  input: {
    destination?: string;
    keyword?: string;
    days?: number;
    preferences?: string[];
    limit?: number;
    offset?: number;
    excludeVideoIds?: string[];
  },
  options?: { cache?: RequestCache },
): Promise<VideoRecommendationsClientResult> {
  const processId = startFrontendDebugProcess("video-search", "查詢旅遊影片推薦", {
    destination: input.destination,
    keyword: input.keyword,
    days: input.days,
    limit: input.limit,
    offset: input.offset,
    preferences: input.preferences,
    excludeVideoIds: input.excludeVideoIds,
  });
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
  if (input.offset) {
    params.set("offset", String(input.offset));
  }
  if (input.excludeVideoIds?.length) {
    params.set("excludeVideoIds", input.excludeVideoIds.join(","));
  }

  const response = await fetch(`/api/videos/recommendations?${params.toString()}`, {
    method: "GET",
    cache: options?.cache ?? "no-store",
  });
  updateFrontendDebugProcess(processId, "api-response", {
    status: response.status,
    ok: response.ok,
  });

  const payload = await parseJson<ApiResponse<VideoRecommendation[]> & { meta?: Record<string, unknown> }>(
    response,
  );

  if (!response.ok || isApiError(payload)) {
    const error = new Error(
      isApiError(payload)
        ? payload.error.message
        : `Request failed with status ${response.status}`,
    );
    failFrontendDebugProcess(processId, error, {
      status: response.status,
    });
    throw error;
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

  const result: VideoRecommendationsClientResult = {
    videos: payload.data,
    source:
      source === "mock-fallback" ||
      source === "youtube-data-api" ||
      source === "preloaded-destination-seed"
        ? source
        : "youtube-data-api",
    fallbackReason:
      typeof payload.meta?.fallbackReason === "string"
        ? payload.meta.fallbackReason
        : undefined,
    debug,
  };
  finishFrontendDebugProcess(processId, {
    resultCount: result.videos.length,
    source: result.source,
    fallbackReason: result.fallbackReason,
    titles: result.videos.slice(0, 6).map((video) => video.title),
  });
  return result;
}

export async function summarizeVideo(input: {
  url?: string;
  videoId?: string;
  title?: string;
  destination?: string;
  /** 清除伺服端快取並強制重新分析（重新呼叫 AI／擷取管線） */
  refresh?: boolean;
  /** 由外層 queue 管理 debug process 時可關閉內層 API debug。 */
  debug?: boolean;
}): Promise<VideoSummaryResult> {
  const shouldDebug = input.debug !== false;
  const processId = shouldDebug
    ? startFrontendDebugProcess("video-summary", "分析旅遊影片", {
        videoId: input.videoId,
        url: input.url,
        title: input.title,
        destination: input.destination,
        refresh: Boolean(input.refresh),
      })
    : null;
  const requestBody = {
    url: input.url,
    videoId: input.videoId,
    title: input.title,
    destination: input.destination,
    refresh: input.refresh,
  };
  const response = await fetch("/api/videos/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(input.refresh ? { "Cache-Control": "no-store" } : {}),
    },
    cache: input.refresh ? "no-store" : "default",
    body: JSON.stringify(requestBody),
  });
  if (processId) {
    updateFrontendDebugProcess(processId, "api-response", {
      status: response.status,
      ok: response.ok,
    });
  }

  const payload = await parseJson<ApiResponse<VideoSummaryResult>>(response);

  if (!response.ok || isApiError(payload)) {
    const error = new Error(
      isApiError(payload)
        ? payload.error.message
        : `Request failed with status ${response.status}`,
    );
    if (processId) {
      failFrontendDebugProcess(processId, error, {
        status: response.status,
        videoId: input.videoId,
        title: input.title,
      });
    }
    throw error;
  }

  if (processId) {
    finishFrontendDebugProcess(processId, {
      videoId: payload.data.video.videoId,
      title: payload.data.video.title,
      summaryUnavailable: payload.data.summaryUnavailable,
      transcriptSource: payload.data.transcriptSource,
      summarySource: payload.data.summarySource,
      segmentSource: payload.data.segmentSource,
      extractedLocationCount: payload.data.video.extractedLocations.length,
      extractedFoodCount: payload.data.video.extractedFoods?.length || 0,
      segmentCount: payload.data.video.summarySegments?.length || 0,
    });
  }
  return payload.data;
}

export async function recordVideoWatch(input: {
  videoId: string;
  videoUrl?: string;
  title?: string;
  currentTripId?: string | null;
  watchDurationSeconds?: number;
  progress?: number;
}) {
  const response = await fetch("/api/videos/interactions/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<ApiResponse<{ id: string }>>(response);
  if (!response.ok || isApiError(payload)) {
    throw new Error(isApiError(payload) ? payload.error.message : `Request failed with status ${response.status}`);
  }
  return payload.data;
}

export async function recordAppliedVideoSummary(input: {
  tripId?: string | null;
  videoId: string;
  summaryId?: string;
  videoUrl?: string;
  title?: string;
  appliedPlaces?: unknown;
  appliedSegments?: unknown;
  createdTripItems?: unknown;
  summarySnapshot?: unknown;
}) {
  const response = await fetch("/api/videos/summaries/apply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<ApiResponse<{ id: string }>>(response);
  if (!response.ok || isApiError(payload)) {
    throw new Error(isApiError(payload) ? payload.error.message : `Request failed with status ${response.status}`);
  }
  return payload.data;
}
