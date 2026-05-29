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
  const dest = context?.destination?.trim();
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

/** 行程產生前：依目的地與偏好組一組保守查詢。 */
export function buildTripPlanResearchRequests(request: TripPlanRequest): TravelToolRequest[] {
  const dest = request.destination?.trim();
  if (!dest) {
    return [];
  }
  const decision = decideSearchIntent({
    message: [
      request.destination,
      request.preferences.notes || "",
      request.preferences.mustVisit?.join(" ") || "",
    ].filter(Boolean).join(" "),
    context: {
      destination: request.destination,
      days: request.days,
      tripStartDate: request.tripStartDate,
      tripEndDate: request.tripEndDate,
      preferences: request.preferences,
      itinerary: request.itineraryDraft,
    },
  });
  if (!decision.shouldSearch) {
    return [];
  }
  const interest = request.preferences.interests.join(" ").trim();
  const q = `${dest} ${request.preferences.notes || ""} ${interest}`.replace(/\s+/g, " ").slice(0, 120);
  const requests: TravelToolRequest[] = [];
  if (decision.searchNeed === "place_details" || decision.searchNeed === "opening_hours" || decision.searchNeed === "fresh_info") {
    requests.push({ type: "search_place", query: q, locationHint: dest });
  }
  if (decision.searchNeed === "weather") {
    requests.push({
      type: "weather_forecast",
      destination: dest,
      startDate: request.tripStartDate,
      endDate: request.tripEndDate || request.tripStartDate,
    });
  }
  const shouldSearchYouTube = /影片|youtube|YouTube|vlog/i.test(request.preferences.notes || "");
  if (shouldSearchYouTube) {
    requests.push({
      type: "youtube_search",
      destination: dest,
      keyword: interest || dest,
      limit: 3,
    });
  }
  if (
    serverConfig.tavilyApiKey.trim() &&
    (decision.searchNeed === "events" ||
      decision.searchNeed === "official_source" ||
      decision.searchNeed === "ticket_price" ||
      decision.searchNeed === "transportation" ||
      decision.searchNeed === "general_web_research")
  ) {
    requests.push({
      type: "tavily_search",
      query: decision.query || `${dest} ${request.preferences.notes || ""} ${request.tripStartDate || ""}`.replace(/\s+/g, " ").trim(),
    });
  }
  return requests;
}

export async function executeTravelToolRequests(
  requests: TravelToolRequest[],
  context?: ChatContext,
  progressSessionId?: string,
): Promise<TravelResearchDigest> {
  const placeHits: PlaceSearchHit[] = [];
  const sections: string[] = [];
  let sources: Record<string, ChatSource> = {};
  const slice = requests.slice(0, 8);

  for (const req of slice) {
    if (req.type === "search_place") {
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢景點與地點資料",
        detail: `正在查詢：${req.query}`,
        provider: "google_places",
        query: req.query,
        status: "running",
      });
      const hint = req.locationHint?.trim() || context?.destination?.trim();
      const res = await searchPlacesByText(req.query, hint, { maxResults: 6 });
      if (res.ok) {
        placeHits.push(...res.places);
        sections.push(`### 地點搜尋（${req.query}）\n${formatPlacesForPrompt(res.places)}`);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢景點與地點資料",
          detail: `找到 ${res.places.length} 筆地點資料。`,
          provider: "google_places",
          query: req.query,
          status: "completed",
        });
      } else {
        sections.push(`### 地點搜尋（${req.query}）\n查詢失敗：${res.reason}`);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢景點與地點資料",
          detail: `查詢失敗：${res.reason}`,
          provider: "google_places",
          query: req.query,
          status: "failed",
        });
      }
      continue;
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
      const res = await tavilySearch({ query: req.query, maxResults: 5 });
      if (res.ok) {
        sections.push(`### 網路摘要（${req.query}）\n${formatTavilyForPrompt(res)}`);
        const normalizedSources = normalizeTavilySources(res.results);
        sources = mergeChatSources(sources, normalizedSources);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢活動與網路摘要",
          detail: `找到 ${res.results.length} 筆摘要結果。`,
          provider: "tavily",
          query: req.query,
          sourceIds: Object.keys(normalizedSources),
          status: "completed",
        });
      } else {
        sections.push(`### 網路摘要（${req.query}）\n略過：${res.reason}`);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢活動與網路摘要",
          detail: `略過：${res.reason}`,
          provider: "tavily",
          query: req.query,
          status: "failed",
        });
      }
      continue;
    }

    if (req.type === "weather_forecast") {
      const destination =
        req.destination?.trim() || context?.destination?.trim() || "";
      if (!destination) {
        sections.push("### 天氣\n略過：無目的地。");
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢天氣條件",
          detail: "略過：無目的地。",
          provider: "open_meteo",
          status: "failed",
        });
        continue;
      }
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢天氣條件",
        detail: `正在查詢 ${destination} 的旅遊日期天氣。`,
        provider: "open_meteo",
        query: `${destination} ${req.startDate || context?.tripStartDate || ""} weather`.trim(),
        status: "running",
      });
      const res = await fetchDestinationWeatherSummary({
        destination,
        startDate: req.startDate || context?.tripStartDate,
        endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
      });
      if (res.ok) {
        sections.push(`### 天氣預報（${destination}）\n${formatWeatherForPrompt(res)}`);
        const normalizedSources = normalizeWeatherSources({
          destination,
          startDate: req.startDate || context?.tripStartDate,
          endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
          lines: res.lines,
        });
        sources = mergeChatSources(sources, normalizedSources);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢天氣條件",
          detail: `已整理 ${res.lines.length} 筆天氣摘要。`,
          provider: "open_meteo",
          query: `${destination} ${req.startDate || context?.tripStartDate || ""} weather`.trim(),
          sourceIds: Object.keys(normalizedSources),
          status: "completed",
        });
      } else {
        sections.push(`### 天氣預報（${destination}）\n略過：${res.reason}`);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢天氣條件",
          detail: `略過：${res.reason}`,
          provider: "open_meteo",
          query: `${destination} ${req.startDate || context?.tripStartDate || ""} weather`.trim(),
          status: "failed",
        });
      }
      continue;
    }

    if (req.type === "youtube_search") {
      const youtubeQuery = [req.destination || context?.destination, req.keyword].filter(Boolean).join(" ").trim();
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢旅遊影片",
        detail: `正在查詢：${youtubeQuery || "travel vlog"}`,
        provider: "youtube",
        query: youtubeQuery || "travel vlog",
        status: "running",
      });
      const res = await searchYouTubeVideos({
        destination: req.destination || context?.destination,
        keyword: req.keyword,
        limit: Math.min(3, Math.max(1, req.limit ?? 2)),
      });
      if (res.videos.length > 0) {
        sections.push(
          `### YouTube 旅遊影片（${req.destination || context?.destination || req.keyword || "travel"}）\n${res.videos
            .slice(0, 3)
            .map((video, index) => `${index + 1}. ${video.title}：${video.summary || video.description || video.url}`)
            .join("\n")}`,
        );
        const normalizedSources = normalizeYouTubeSources(res.videos.slice(0, 3));
        sources = mergeChatSources(sources, normalizedSources);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢旅遊影片",
          detail: `找到 ${Math.min(3, res.videos.length)} 支旅遊影片。`,
          provider: "youtube",
          query: youtubeQuery || "travel vlog",
          sourceIds: Object.keys(normalizedSources),
          status: "completed",
        });
      } else if (res.fallbackReason) {
        sections.push(`### YouTube 旅遊影片\n略過：${res.fallbackReason}`);
        publishResearchProgress(progressSessionId, {
          phase: "research",
          label: "查詢旅遊影片",
          detail: `略過：${res.fallbackReason}`,
          provider: "youtube",
          query: youtubeQuery || "travel vlog",
          status: "failed",
        });
      }
    }
  }

  return {
    text: sections.join("\n\n").slice(0, 24_000),
    placeHits: dedupePlaces(placeHits),
    sources,
  };
}
