import { rankPlaceCandidates } from "@/server/personalization/placePreferenceRanking";
import { mapService } from "@/server/maps/service";
import { prisma } from "@/lib/prisma";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { z } from "zod";
import { TravelResearchToolRequestSchema } from "@/server/ai/schemas/travelPlanningSchemas";
import { geocodePlace } from "@/server/places/geocodePlace";
import { localizedPlaceAlias } from "@/server/places/localizedAliases";
import { osmSourceUrl } from "@/lib/osmSourceUrl";
import type { MapPoiCategory } from "@/server/maps/types";
import { enrichChatContextWithDestinationScope } from "@/lib/tripDestinationScope";
import type { ChatContext, ChatSource, PersonalizedAIContext, TripPlanRequest } from "@/types";
import { serverConfig } from "@/server/config";
import {
  searchPlacesByText,
  type PlaceSearchHit,
} from "@/server/geo/osmPlacesSearchService";
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
  | { type: "get_current_trip" }
  | { type: "search_past_trips"; query?: string }
  | { type: "resolve_place"; query: string; locationHint?: string }
  | { type: "get_route_matrix"; points: Array<{ lat: number; lng: number }> }
  | { type: "search_place"; query: string; locationHint?: string }
  | { type: "search_nearby_places"; anchor: string; category: MapPoiCategory; radius?: number }
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
        p.openingHours ? `營業時間：${p.openingHours}` : "營業時間：待確認",
        p.source ? `地點來源：${p.source}` : "",
        p.checkedAt ? `查核時間：${p.checkedAt}` : "",
        osmSourceUrl(p.placeId) ? `來源連結：${osmSourceUrl(p.placeId)}` : p.googleMapsUrl ? `連結：${p.googleMapsUrl}` : "",
      ].filter(Boolean);
      return parts.join("；");
    })
    .join("\n");
}

const youtubeToolRequestSchema = z.strictObject({
  type: z.literal("youtube_search"),
  destination: z.string().trim().max(120).optional(),
  keyword: z.string().trim().max(180).optional(),
  limit: z.number().int().min(1).max(5).optional(),
});

export function parseTravelToolRequestsFromModel(raw: unknown): TravelToolRequest[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const requests: TravelToolRequest[] = [];
  for (const value of raw) {
    const parsed = TravelResearchToolRequestSchema.safeParse(value);
    if (parsed.success) requests.push(parsed.data);
    else {
      const youtube = youtubeToolRequestSchema.safeParse(value);
      if (youtube.success) requests.push(youtube.data);
    }
    if (requests.length === 8) break;
  }
  return requests;
}

/** 當模型未提出工具請求時，依使用者訊息與行程脈絡補一組保守查詢。 */
export function buildDefaultTravelToolRequests(
  message: string,
  context?: ChatContext,
): TravelToolRequest[] {
  const requests: TravelToolRequest[] = [];
  const searchDecision = decideSearchIntent({ message, context });
  const nearby = buildNearbyTravelToolRequest(message, context);
  if (nearby) requests.push(nearby);
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

  if (dest && wantsPoi && !nearby) {
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

export function buildNearbyTravelToolRequest(message: string, context?: ChatContext): Extract<TravelToolRequest, { type: "search_nearby_places" }> | null {
  const match = message.match(/([^，。\s]{2,32})(?:附近|周圍|周邊|周遭)/u);
  const extracted = match?.[1]?.replace(/^(?:(?:請|幫我|幫忙|我想|想要|找|查|推薦|在)|(?:這份|目前|我的)?行程(?:裡|中)?的?|第(?:\d+|[一二三四五六七八九十]+)天(?:行程)?的?)+/u, "").trim();
  const anchor = extracted && !/^(?:這個|這裡|這附近|那個|那裡|目前|選中的|選取的)$/u.test(extracted)
    ? extracted
    : /附近|周圍|周邊|周遭/u.test(message) ? context?.selectedPlace?.name : undefined;
  if (!anchor) return null;
  const category: MapPoiCategory = /咖啡|下午茶/u.test(message) ? "cafe" : /博物館|美術館/u.test(message) ? "museum" : /公園|庭園/u.test(message) ? "park" : /飯店|住宿/u.test(message) ? "hotel" : /車站|地鐵/u.test(message) ? "station" : /餐廳|美食|吃|小吃|午餐|晚餐/u.test(message) ? "restaurant" : "attraction";
  return { type: "search_nearby_places", anchor, category, radius: 1500 };
}

/** 行程產生前：依目的地與偏好組一組保守查詢（完整行程專用，不受聊天 decideSearchIntent 限制）。 */
export function buildTripPlanResearchRequests(request: TripPlanRequest): TravelToolRequest[] {
  return buildTripPlanResearchPlan(request).toolRequests;
}

async function withProviderTimeout<T>(work: Promise<T>): Promise<T> {
  const timeoutMs = serverConfig.travelResearchProviderTimeoutMs;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`provider_timeout_${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function savedTripNearbyAnchor(tripId: string, name: string): Promise<{ name: string; lat: number; lng: number } | null> {
  const [items, pins] = await Promise.all([
    prisma.tripItem.findMany({ where: { tripId, title: name, verified: true }, select: { latitude: true, longitude: true }, take: 4 }),
    prisma.mapPin.findMany({ where: { tripId, label: name, verified: true }, select: { lat: true, lng: true }, take: 4 }),
  ]);
  const points = [
    ...items.map((item) => ({ lat: item.latitude, lng: item.longitude })),
    ...pins.map((pin) => ({ lat: pin.lat, lng: pin.lng })),
  ].filter((point): point is { lat: number; lng: number } =>
    point.lat !== null && point.lng !== null && hasUsableMapCoordinate({ lat: point.lat, lng: point.lng }));
  if (!points.length) return null;
  const first = points[0];
  if (points.some((point) => Math.abs(point.lat - first.lat) > 0.003 || Math.abs(point.lng - first.lng) > 0.003)) return null;
  return { name, ...first };
}

async function executeSingleTravelToolRequest(
  req: TravelToolRequest,
  context: ChatContext | undefined,
  progressSessionId: string | undefined,
  verifiedContext?: PersonalizedAIContext,
): Promise<{
  placeHits: PlaceSearchHit[];
  section?: string;
  sources: Record<string, ChatSource>;
}> {
  const cacheTtlMs = serverConfig.travelSearchCacheTtlMs;

  if (req.type === "get_current_trip") {
    const trip = verifiedContext?.currentTrip;
    return { placeHits: [], sources: {}, section: trip ? `### 目前行程（${trip.title || trip.destination || trip.id}）\n${trip.days.slice(0, 14).map((day) => `第 ${day.dayNumber} 天：${day.items.slice(0, 12).map((item) => item.title).join("、") || "尚無地點"}`).join("\n")}` : "目前沒有可讀取的行程。" };
  }
  if (req.type === "search_past_trips") {
    const query = req.query?.trim().toLocaleLowerCase();
    const trips = (verifiedContext?.recentTrips || []).filter((trip) => !query || `${trip.title || ""} ${trip.destination || ""} ${(trip.representativeItems || []).join(" ")}`.toLocaleLowerCase().includes(query)).slice(0, 5);
    return { placeHits: [], sources: {}, section: trips.length ? `### 歷史行程\n${trips.map((trip) => `${trip.title || trip.destination || "未命名"}：${(trip.representativeItems || []).slice(0, 8).join("、")}`).join("\n")}` : "沒有符合條件的歷史行程。" };
  }
  if (req.type === "get_route_matrix") {
    try {
      const matrix = await withProviderTimeout(mapService.getDistanceMatrix(req.points));
      return { placeHits: [], sources: {}, section: `### 道路距離矩陣（公尺）\n${JSON.stringify(matrix).slice(0, 2400)}` };
    } catch { return { placeHits: [], sources: {}, section: "路線矩陣暫時無法取得。" }; }
  }
  if (req.type === "resolve_place") {
    return executeSingleTravelToolRequest({ type: "search_place", query: req.query, locationHint: req.locationHint }, context, progressSessionId, verifiedContext);
  }
  if (req.type === "search_nearby_places") {
    try {
      const selected = context?.selectedPlace?.name === req.anchor ? context.selectedPlace : null;
      let anchor: { name: string; lat: number; lng: number } | null = selected;
      if (!anchor && verifiedContext?.currentTrip?.id) {
        anchor = await withProviderTimeout(savedTripNearbyAnchor(verifiedContext.currentTrip.id, req.anchor)).catch(() => null);
      }
      if (!anchor) {
        const resolved = await withProviderTimeout((async () => {
          let result = await geocodePlace({ query: req.anchor, destinationHint: context?.destination });
          const alias = !result.ok ? localizedPlaceAlias(req.anchor, context?.destination || "") : null;
          if (alias) result = await geocodePlace({ query: alias.query, destinationHint: context?.destination });
          return result;
        })());
        if (!resolved.ok || !resolved.place.placeId || (resolved.place.confidence ?? 0) < 0.7) {
          return { placeHits: [], section: `找不到「${req.anchor}」的可靠座標，無法查詢附近地點。`, sources: {} };
        }
        anchor = { name: req.anchor, lat: resolved.place.lat, lng: resolved.place.lng };
      }
      const radius = Math.min(5000, Math.max(100, typeof req.radius === "number" && Number.isFinite(req.radius) ? req.radius : 1500));
      const nearby = await withProviderTimeout(mapService.searchNearbyPoi({ lat: anchor.lat, lng: anchor.lng }, { category: req.category, radius, limit: 12 }));
      const distance = (lat: number, lng: number) => {
        const radians = Math.PI / 180;
        const deltaLat = (lat - anchor.lat) * radians;
        const deltaLng = (lng - anchor.lng) * radians;
        const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(anchor.lat * radians) * Math.cos(lat * radians) * Math.sin(deltaLng / 2) ** 2;
        return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
      };
      const places: PlaceSearchHit[] = nearby
        .filter((poi) => distance(poi.location.lat, poi.location.lng) <= radius)
        .sort((a, b) => distance(a.location.lat, a.location.lng) - distance(b.location.lat, b.location.lng))
        .map((poi) => ({ name: poi.name, formattedAddress: poi.address || "", lat: poi.location.lat, lng: poi.location.lng, placeId: poi.id, types: [poi.category || req.category], openingHours: poi.metadata?.openingHours, website: poi.metadata?.website, source: poi.source === "overpass" ? "overpass" as const : "photon" as const, checkedAt: poi.checkedAt }));
      publishResearchProgress(progressSessionId, { phase: "research", label: "查詢附近地點", detail: `以 ${anchor.name} 為中心找到 ${places.length} 處地點。`, provider: "overpass", status: "completed" });
      return { placeHits: places, section: `### ${anchor.name} 附近地點（${radius} 公尺內，按距離排序）\n${places.length ? formatPlacesForPrompt(places) : "查無可驗證地點，請擴大範圍或更換地點。"}`, sources: {} };
    } catch {
      return { placeHits: [], section: "附近地點服務暫時無法使用，未加入未驗證地點。", sources: {} };
    }
  }

  if (req.type === "search_place") {
    publishResearchProgress(progressSessionId, {
      phase: "research",
      label: "查詢地點候選",
      detail: `正在查詢：${req.query}`,
      provider: "photon",
      query: req.query,
      status: "running",
    });
    const hint = req.locationHint?.trim() || context?.destination?.trim();
    const cacheKey = buildTravelSearchCacheKey({
      provider: "photon",
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
          provider: "photon",
          query: req.query,
          status: "completed",
        });
        return {
          placeHits: rankPlaceCandidates(res.places, context?.preferences),
          section: `### 地點搜尋（${req.query}）\n${formatPlacesForPrompt(rankPlaceCandidates(res.places, context?.preferences))}`,
          sources: {},
        };
      }
      publishResearchProgress(progressSessionId, {
        phase: "research",
        label: "查詢地點候選",
        detail: `查詢失敗：${res.reason}`,
        provider: "photon",
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
        provider: "photon",
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
  verifiedContext?: PersonalizedAIContext,
): Promise<TravelResearchDigest> {
  const slice = requests.slice(0, 8);
  const settled = await Promise.allSettled(
    slice.map((req) => executeSingleTravelToolRequest(req, context, progressSessionId, verifiedContext)),
  );

  const placeHits: PlaceSearchHit[] = [];
  const sections: string[] = [];
  let sources: Record<string, ChatSource> = {};

  for (const [index, result] of settled.entries()) {
    console.info("[travel-research] tool_result", {
      tripId: verifiedContext?.currentTrip?.id || null,
      tool: slice[index]?.type,
      status: result.status,
      placeCount: result.status === "fulfilled" ? result.value.placeHits.length : 0,
      sourceCount: result.status === "fulfilled" ? Object.keys(result.value.sources).length : 0,
    });
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
    placeHits: rankPlaceCandidates(dedupePlaces(placeHits), context?.preferences),
    sources,
  };
}
