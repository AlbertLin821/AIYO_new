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
  const dest = context?.destination?.trim();
  const trimmed = message.trim();
  const wantsPoi =
    /(餐廳|美食|景點|約會|推薦|住宿|咖啡|夜市|小吃|甜點|下午茶|酒吧|購物|百貨|博物館|公園|步道)/u.test(
      trimmed,
    );

  if (dest && wantsPoi) {
    const q = `${dest} ${trimmed}`.replace(/\s+/g, " ").slice(0, 120);
    requests.push({ type: "search_place", query: q, locationHint: dest });
  }

  if (dest) {
    requests.push({
      type: "weather_forecast",
      destination: dest,
      startDate: context?.tripStartDate,
      endDate: context?.tripEndDate || context?.tripStartDate,
    });
  }

  if (dest && serverConfig.tavilyApiKey.trim()) {
    requests.push({
      type: "tavily_search",
      query: `${dest} 活動 市集 封路 交通管制 ${context?.tripStartDate || ""}`.replace(/\s+/g, " ").trim(),
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
  const interest = request.preferences.interests.join(" ").trim();
  const q = `${dest} 景點 美食 ${interest}`.replace(/\s+/g, " ").slice(0, 120);
  const requests: TravelToolRequest[] = [
    { type: "search_place", query: q, locationHint: dest },
    {
      type: "weather_forecast",
      destination: dest,
      startDate: request.tripStartDate,
      endDate: request.tripEndDate || request.tripStartDate,
    },
  ];
  const shouldSearchYouTube =
    Boolean(request.preferences.mustVisit?.length) ||
    /(history|nature|city_walk|onsen|景點|古蹟|散步|溫泉|風景)/i.test(interest);
  if (shouldSearchYouTube) {
    requests.push({
      type: "youtube_search",
      destination: dest,
      keyword: interest || dest,
      limit: 3,
    });
  }
  if (serverConfig.tavilyApiKey.trim()) {
    requests.push({
      type: "tavily_search",
      query: `${dest} 旅遊 活動 展覽 市集 ${request.tripStartDate || ""}`.replace(/\s+/g, " ").trim(),
    });
  }
  return requests;
}

export async function executeTravelToolRequests(
  requests: TravelToolRequest[],
  context?: ChatContext,
): Promise<TravelResearchDigest> {
  const placeHits: PlaceSearchHit[] = [];
  const sections: string[] = [];
  let sources: Record<string, ChatSource> = {};
  const slice = requests.slice(0, 8);

  for (const req of slice) {
    if (req.type === "search_place") {
      const hint = req.locationHint?.trim() || context?.destination?.trim();
      const res = await searchPlacesByText(req.query, hint, { maxResults: 6 });
      if (res.ok) {
        placeHits.push(...res.places);
        sections.push(`### 地點搜尋（${req.query}）\n${formatPlacesForPrompt(res.places)}`);
      } else {
        sections.push(`### 地點搜尋（${req.query}）\n查詢失敗：${res.reason}`);
      }
      continue;
    }

    if (req.type === "tavily_search") {
      const res = await tavilySearch({ query: req.query, maxResults: 5 });
      if (res.ok) {
        sections.push(`### 網路摘要（${req.query}）\n${formatTavilyForPrompt(res)}`);
        sources = mergeChatSources(sources, normalizeTavilySources(res.results));
      } else {
        sections.push(`### 網路摘要（${req.query}）\n略過：${res.reason}`);
      }
      continue;
    }

    if (req.type === "weather_forecast") {
      const destination =
        req.destination?.trim() || context?.destination?.trim() || "";
      if (!destination) {
        sections.push("### 天氣\n略過：無目的地。");
        continue;
      }
      const res = await fetchDestinationWeatherSummary({
        destination,
        startDate: req.startDate || context?.tripStartDate,
        endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
      });
      if (res.ok) {
        sections.push(`### 天氣預報（${destination}）\n${formatWeatherForPrompt(res)}`);
        sources = mergeChatSources(
          sources,
          normalizeWeatherSources({
            destination,
            startDate: req.startDate || context?.tripStartDate,
            endDate: req.endDate || context?.tripEndDate || req.startDate || context?.tripStartDate,
            lines: res.lines,
          }),
        );
      } else {
        sections.push(`### 天氣預報（${destination}）\n略過：${res.reason}`);
      }
      continue;
    }

    if (req.type === "youtube_search") {
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
        sources = mergeChatSources(sources, normalizeYouTubeSources(res.videos.slice(0, 3)));
      } else if (res.fallbackReason) {
        sections.push(`### YouTube 旅遊影片\n略過：${res.fallbackReason}`);
      }
    }
  }

  return {
    text: sections.join("\n\n").slice(0, 24_000),
    placeHits: dedupePlaces(placeHits),
    sources,
  };
}
