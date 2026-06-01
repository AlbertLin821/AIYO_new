import { enrichChatContextWithDestinationScope } from "@/lib/tripDestinationScope";
import type { ChatContext, ChatSource, TripPlanRequest } from "@/types";
import { serverConfig } from "@/server/config";
import {
  searchPlacesByText,
  type PlaceSearchHit,
} from "@/server/geo/placesSearchService";
import {
  fetchDestinationWeatherSummary,
  formatWeatherForPrompt,
} from "@/server/providers/openMeteoWeather";
import { formatTavilyForPrompt, tavilySearch } from "@/server/providers/tavilySearch";
import { searchYouTubeVideos } from "@/server/providers/youtubeProvider";
import {
  mergeChatSources,
  normalizeTavilySources,
  normalizeWeatherSources,
  normalizeYouTubeSources,
} from "@/server/chat/sourceNormalization";
import { publishChatProgress } from "@/server/chat/chatProgressStore";
import { decideSearchIntent } from "@/server/search/searchIntent";
import { buildTripPlanResearchPlan } from "@/server/ai/planning/tripPlanResearchPolicy";
import {
  buildTravelSearchCacheKey,
  withTravelSearchCache,
} from "@/server/search/travelSearchCache";
import type { StatusStepPayload } from "@/types";

export type TravelToolRequest =
  | { type: "search_place"; query: string; locationHint?: string }
  | { type: "tavily_search"; query: string }
  | { type: "weather_forecast"; destination?: string; startDate?: string; endDate?: string }
  | { type: "youtube_search"; destination?: string; keyword?: string; limit?: number };

export type TravelResearchDigest = {
  text: string;
  placeHits: PlaceSearchHit[];
  sources: Record<string, ChatSource>;
};

function publishResearchProgress(
  progressSessionId: string | undefined,
  step: Omit<StatusStepPayload, "type">,
) {
  if (!progressSessionId) {
    return;
  }
  const timestamp = new Date().toISOString();
  publishChatProgress(progressSessionId, {
    type: "status_step",
    ...step,
    startedAt: step.startedAt || (step.status === "running" ? timestamp : undefined),
    completedAt: step.status === "completed" || step.status === "failed" ? step.completedAt || timestamp : undefined,
  });
}

function dedupePlaces(places: PlaceSearchHit[]): PlaceSearchHit[] {
  const seen = new Set<string>();
  const out: PlaceSearchHit[] = [];
  for (const p of places) {
    const key = p.placeId || `${p.lat},${p.lng},${p.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(p);
  }
  return out;
}

export function formatPlacesForPrompt(places: PlaceSearchHit[]): string {
  return places
    .map((p, i) => {
      const parts = [
        `${i + 1}. ${p.name}`,
        p.formattedAddress ? `地址：${p.formattedAddress}` : "",
        p.rating !== undefined ? `評分：${p.rating}${p.userRatingsTotal ? `（${p.userRatingsTotal} 則）` : ""}` : "",
        p.openingHours ? `營業時間：${p.openingHours}` : "",
        p.googleMapsUrl ? `連結：${p.googleMapsUrl}` : "",
      ].filter(Boolean);
      return parts.join("；");
    })
    .join("\n");
}

function isTravelToolRequest(value: unknown): value is TravelToolRequest {
  if (!value || typeof value !== "object") {
    return false;
  }
  const r = value as Record<string, unknown>;
  if (r.type === "search_place" && typeof r.query === "string") {
    return true;
  }
  if (r.type === "tavily_search" && typeof r.query === "string") {
    return true;
  }
  if (r.type === "weather_forecast") {
    return true;
  }
  if (r.type === "youtube_search") {
    return true;
  }
  return false;
}

export function parseTravelToolRequestsFromModel(raw: unknown): TravelToolRequest[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter(isTravelToolRequest);
}

/** 當模型未提出工具請求時，依使用者訊息與行程脈絡補一組保守查詢。 */
export function buildDefaultTravelToolRequests(
  message: string,
  context?: ChatContext,
): TravelToolRequest[] {
  const requests: TravelToolRequest[] = [];
  const searchDecision = decideSearchIntent({ message, context });
  if (!searchDecision.shouldSearch) {
    const wantsVideo = /影片|youtube|YouTube|vlog|靈感|參考影片|旅遊影片/u.test(message.trim());
    if (!wantsVideo) {
      return requests;
    }
  }
  const scopedContext = enrichChatContextWithDestinationScope(context);
  const dest =
    scopedContext?.destinationScope?.canonicalLabel?.trim() ||
    scopedContext?.destination?.trim() ||
    context?.destination?.trim();
  const trimmed = message.trim();
  const wantsVideo = /影片|youtube|YouTube|vlog|靈感|參考影片|旅遊影片/u.test(trimmed);
  const wantsPoi =
    /(餐廳|美食|景點|約會|推薦|住宿|咖啡|夜市|小吃|甜點|下午茶|酒吧|購物|百貨|博物館|公園|步道)/u.test(
      trimmed,
    );
  const wantsWeather = /天氣|降雨|氣溫|下雨|颱風/u.test(trimmed);
  const wantsEvents = /活動|市集|祭典|展覽|封路|交通管制|改道/u.test(trimmed);

  if (dest && wantsPoi) {
    const q = `${dest} ${trimmed}`.replace(/\s+/g, " ").slice(0, 120);
    requests.push({ type: "search_place", query: q, locationHint: dest });
  }

  if (dest && wantsWeather) {
    requests.push({
      type: "weather_forecast",
      destination: dest,
      startDate: context?.tripStartDate,
      endDate: context?.tripEndDate || context?.tripStartDate,
    });
  }

  if (dest && wantsEvents && serverConfig.tavilyApiKey.trim()) {
    requests.push({
      type: "tavily_search",
      query: `${dest} 活動 市集 封路 交通管制 ${context?.tripStartDate || ""}`.replace(/\s+/g, " ").trim(),
    });
  }

  if (dest && wantsVideo) {
    requests.push({
      type: "youtube_search",
      destination: dest,
      keyword: trimmed,
      limit: 3,
    });
  }

  return requests;
}

/** 行程產生前：依目的地與偏好組一組保守查詢（完整行程專用，不受聊天 decideSearchIntent 限制）。 */
export function buildTripPlanResearchRequests(request: TripPlanRequest): TravelToolRequest[] {
  return buildTripPlanResearchPlan(request).toolRequests;
}

async function withProviderTimeout<T>(work: Promise<T>): Promise<T> {
  const timeoutMs = serverConfig.travelResearchProviderTimeoutMs;
  return Promise.race([
    work,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error(`provider_timeout_${timeoutMs}ms`)), timeoutMs);
    }),
  ]);
}

async function executeSingleTravelToolRequest(
  req: TravelToolRequest,
  context: ChatContext | undefined,
  progressSessionId: string | undefined,
): Promise<{
  placeHits: PlaceSearchHit[];
  section?: string;
  sources: Record<string, ChatSource>;
}> {
  const cacheTtlMs = serverConfig.travelSearchCacheTtlMs;

  if (req.type === "search_place") {
    publishResearchProgress(progressSessionId, {
      phase: "research",
      label: "查詢地點候選",
      detail: `正在查詢：${req.query}`,
      provider: "google_places",
      query: req.query,
      status: "running",
    });
    const hint = req.locationHint?.trim() || context?.destination?.trim();
    const cacheKey = buildTravelSearchCacheKey({
      provider: "google_places",
      query: req.query,
      destination: hint,
    });
    try {
      const res = await withTravelSearchCache(cacheKey, cacheTtlMs, () =>
        withProviderTimeout(searchPlacesByText(req.query, hint, { maxResults: 6 })),
      );
      if (res.ok) {
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢地點候選",
          detail: `找到 ${res.places.length} 筆地點資料。`,
          provider: "google_places",
          query: req.query,
          status: "completed",
        });
        return {
          placeHits: res.places,
          section: `### 地點搜尋（${req.query}）\n${formatPlacesForPrompt(res.places)}`,
          sources: {},
        };
      }
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢地點候選",
        detail: `查詢失敗：${res.reason}`,
        provider: "google_places",
        query: req.query,
        status: "failed",
      });
      return {
        placeHits: [],
        section: `### 地點搜尋（${req.query}）\n查詢失敗：${res.reason}`,
        sources: {},
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error";
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢地點候選",
        detail: `查詢失敗：${reason}`,
        provider: "google_places",
        query: req.query,
        status: "failed",
      });
      return { placeHits: [], section: `### 地點搜尋（${req.query}）\n查詢失敗：${reason}`, sources: {} };
    }
  }

  if (req.type === "tavily_search") {
    publishResearchProgress(progressSessionId, {
      phase: "research",
      label: "查詢活動與網路摘要",
      detail: `正在查詢：${req.query}`,
      provider: "tavily",
      query: req.query,
      status: "running",
    });
    const cacheKey = buildTravelSearchCacheKey({ provider: "tavily", query: req.query });
    try {
      const res = await withTravelSearchCache(cacheKey, cacheTtlMs, () =>
        withProviderTimeout(tavilySearch({ query: req.query, maxResults: 5 })),
      );
      if (res.ok) {
        const normalizedSources = normalizeTavilySources(res.results);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢活動與網路摘要",
          detail: `找到 ${res.results.length} 筆摘要結果。`,
          provider: "tavily",
          query: req.query,
          sourceIds: Object.keys(normalizedSources),
          status: "completed",
        });
        return {
          placeHits: [],
          section: `### 網路摘要（${req.query}）\n${formatTavilyForPrompt(res)}`,
          sources: normalizedSources,
        };
      }
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢活動與網路摘要",
        detail: `略過：${res.reason}`,
        provider: "tavily",
        query: req.query,
        status: "failed",
      });
      return { placeHits: [], section: `### 網路摘要（${req.query}）\n略過：${res.reason}`, sources: {} };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error";
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢活動與網路摘要",
        detail: `略過：${reason}`,
        provider: "tavily",
        query: req.query,
        status: "failed",
      });
      return { placeHits: [], section: `### 網路摘要（${req.query}）\n略過：${reason}`, sources: {} };
    }
  }

  if (req.type === "weather_forecast") {
    const destination = req.destination?.trim() || context?.destination?.trim() || "";
    if (!destination) {
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢天氣／活動",
        detail: "略過：無目的地。",
        provider: "open_meteo",
        status: "failed",
      });
      return { placeHits: [], section: "### 天氣\n略過：無目的地。", sources: {} };
    }
    publishResearchProgress(progressSessionId, {
      phase: "research",
      label: "查詢天氣／活動",
      detail: `正在查詢 ${destination} 的旅遊日期天氣。`,
      provider: "open_meteo",
      query: `${destination} ${req.startDate || context?.tripStartDate || ""} weather`.trim(),
      status: "running",
    });
    const cacheKey = buildTravelSearchCacheKey({
      provider: "open_meteo",
      destination,
      startDate: req.startDate || context?.tripStartDate,
      endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
    });
    try {
      const res = await withTravelSearchCache(cacheKey, cacheTtlMs, () =>
        withProviderTimeout(
          fetchDestinationWeatherSummary({
            destination,
            startDate: req.startDate || context?.tripStartDate,
            endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
          }),
        ),
      );
      if (res.ok) {
        const normalizedSources = normalizeWeatherSources({
          destination,
          startDate: req.startDate || context?.tripStartDate,
          endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
          lines: res.lines,
        });
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢天氣／活動",
          detail: `已整理 ${res.lines.length} 筆天氣摘要。`,
          provider: "open_meteo",
          query: `${destination} ${req.startDate || context?.tripStartDate || ""} weather`.trim(),
          sourceIds: Object.keys(normalizedSources),
          status: "completed",
        });
        return {
          placeHits: [],
          section: `### 天氣預報（${destination}）\n${formatWeatherForPrompt(res)}`,
          sources: normalizedSources,
        };
      }
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢天氣／活動",
        detail: `略過：${res.reason}`,
        provider: "open_meteo",
        query: `${destination} ${req.startDate || context?.tripStartDate || ""} weather`.trim(),
        status: "failed",
      });
      return {
        placeHits: [],
        section: `### 天氣預報（${destination}）\n略過：${res.reason}`,
        sources: {},
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown_error";
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢天氣／活動",
        detail: `略過：${reason}`,
        provider: "open_meteo",
        status: "failed",
      });
      return { placeHits: [], section: `### 天氣預報（${destination}）\n略過：${reason}`, sources: {} };
    }
  }

  const youtubeQuery = [req.destination || context?.destination, req.keyword].filter(Boolean).join(" ").trim();
  publishResearchProgress(progressSessionId, {
    phase: "research",
    label: "查詢旅遊影片",
    detail: `正在查詢：${youtubeQuery || "travel vlog"}`,
    provider: "youtube",
    query: youtubeQuery || "travel vlog",
    status: "running",
  });
  const videoDest = req.destination || context?.destination;
  const cacheKey = buildTravelSearchCacheKey({
    provider: "youtube",
    destination: videoDest,
    query: req.keyword,
  });
  try {
    const res = await withTravelSearchCache(cacheKey, cacheTtlMs, () =>
      withProviderTimeout(
        searchYouTubeVideos({
          destination: videoDest,
          keyword: req.keyword,
          limit: Math.min(3, Math.max(1, req.limit ?? 2)),
          destinationScope: enrichChatContextWithDestinationScope({
            destination: videoDest,
            destinationScope: context?.destinationScope,
          })?.destinationScope,
        }),
      ),
    );
    if (res.videos.length > 0) {
      const normalizedSources = normalizeYouTubeSources(res.videos.slice(0, 3));
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢旅遊影片",
        detail: `找到 ${Math.min(3, res.videos.length)} 支旅遊影片。`,
        provider: "youtube",
        query: youtubeQuery || "travel vlog",
        sourceIds: Object.keys(normalizedSources),
        status: "completed",
      });
      return {
        placeHits: [],
        section: `### YouTube 旅遊影片（${req.destination || context?.destination || req.keyword || "travel"}）\n${res.videos
          .slice(0, 3)
          .map((video, index) => `${index + 1}. ${video.title}：${video.summary || video.description || video.url}`)
          .join("\n")}`,
        sources: normalizedSources,
      };
    }
    if (res.fallbackReason) {
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢旅遊影片",
        detail: `略過：${res.fallbackReason}`,
        provider: "youtube",
        query: youtubeQuery || "travel vlog",
        status: "failed",
      });
      return { placeHits: [], section: `### YouTube 旅遊影片\n略過：${res.fallbackReason}`, sources: {} };
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown_error";
    publishResearchProgress(progressSessionId, {
      phase: "research",
      label: "查詢旅遊影片",
      detail: `略過：${reason}`,
      provider: "youtube",
      query: youtubeQuery || "travel vlog",
      status: "failed",
    });
    return { placeHits: [], section: `### YouTube 旅遊影片\n略過：${reason}`, sources: {} };
  }

  return { placeHits: [], sources: {} };
}

export async function executeTravelToolRequests(
  requests: TravelToolRequest[],
  context?: ChatContext,
  progressSessionId?: string,
): Promise<TravelResearchDigest> {
  const slice = requests.slice(0, 8);
  const settled = await Promise.allSettled(
    slice.map((req) => executeSingleTravelToolRequest(req, context, progressSessionId)),
  );

  const placeHits: PlaceSearchHit[] = [];
  const sections: string[] = [];
  let sources: Record<string, ChatSource> = {};

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      console.warn("[travel-research] provider_failed", result.reason);
      continue;
    }
    placeHits.push(...result.value.placeHits);
    if (result.value.section) {
      sections.push(result.value.section);
    }
    sources = mergeChatSources(sources, result.value.sources);
  }

  return {
    text: sections.join("\n\n").slice(0, 24_000),
    placeHits: dedupePlaces(placeHits),
    sources,
  };
}
