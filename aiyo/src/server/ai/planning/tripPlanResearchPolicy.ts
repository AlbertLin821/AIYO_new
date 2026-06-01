import { enrichChatContextWithDestinationScope } from "@/lib/tripDestinationScope";
import type { TripDestinationScope } from "@/lib/tripDestinationScope";
import type { TripPlanRequest } from "@/types";
import { serverConfig } from "@/server/config";
import type { TravelToolRequest } from "@/server/services/travelResearchTools";

export type TripPlanResearchPlan = {
  shouldResearch: boolean;
  toolRequests: TravelToolRequest[];
  webSearchQueries: string[];
  reason: string;
  freshnessRequired: boolean;
};

const FRESHNESS_PATTERN =
  /今天|今日|營業|開到幾點|公休|票價|門票|入場費|價格|祭典|市集|展覽|交通管制|封路|官方|公告|近期|最新/u;

const VIDEO_PATTERN = /影片|youtube|YouTube|vlog/i;

function buildScopeLabel(request: TripPlanRequest): string {
  const dest = request.destination?.trim() || "";
  if (!dest) {
    return "";
  }
  const scoped = enrichChatContextWithDestinationScope<{
    destination?: string;
    destinationScope?: TripDestinationScope;
  }>({ destination: dest });
  return scoped?.destinationScope?.canonicalLabel || dest;
}

function collectPlaceQueries(request: TripPlanRequest, scopeLabel: string): string[] {
  const dest = request.destination?.trim() || "";
  const interests = request.preferences.interests.filter(Boolean);
  const mustVisit = request.preferences.mustVisit || [];
  const notes = request.preferences.notes?.trim() || "";
  const queries = new Set<string>();

  const base = `${scopeLabel} ${interests.join(" ")} ${mustVisit.join(" ")} ${notes}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (base.length >= 4) {
    queries.add(base);
  }

  for (const interest of interests.slice(0, 3)) {
    const q = `${scopeLabel} ${interest}`.replace(/\s+/g, " ").trim().slice(0, 120);
    if (q.length >= 4) {
      queries.add(q);
    }
  }

  for (const place of mustVisit.slice(0, 4)) {
    const q = `${scopeLabel} ${place}`.replace(/\s+/g, " ").trim().slice(0, 120);
    if (q.length >= 4) {
      queries.add(q);
    }
  }

  if (!queries.size && dest) {
    queries.add(`${scopeLabel} 景點 美食`.replace(/\s+/g, " ").trim().slice(0, 120));
  }

  const restaurantQuery = `${scopeLabel} 餐廳 美食 ${interests.join(" ") || ""}`
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  if (restaurantQuery.length >= 4) {
    queries.add(restaurantQuery);
  }

  const ordered = [...queries];
  const restaurant = ordered.find((query) => query.includes("餐廳"));
  const nonRestaurant = ordered.filter((query) => query !== restaurant);
  return [...nonRestaurant.slice(0, restaurant ? 2 : 3), ...(restaurant ? [restaurant] : [])];
}

function needsFreshnessResearch(request: TripPlanRequest): boolean {
  const corpus = [
    request.preferences.notes || "",
    request.preferences.interests.join(" "),
    request.preferences.mustVisit?.join(" ") || "",
  ].join(" ");
  return FRESHNESS_PATTERN.test(corpus);
}

function needsVideoResearch(request: TripPlanRequest): boolean {
  return VIDEO_PATTERN.test(request.preferences.notes || "");
}

export function buildTripPlanResearchPlan(request: TripPlanRequest): TripPlanResearchPlan {
  const dest = request.destination?.trim();
  if (!dest) {
    return {
      shouldResearch: false,
      toolRequests: [],
      webSearchQueries: [],
      reason: "缺少目的地，無法規劃外部研究。",
      freshnessRequired: false,
    };
  }

  const scopeLabel = buildScopeLabel(request);
  const hasDates = Boolean(request.tripStartDate?.trim());
  const freshnessRequired = needsFreshnessResearch(request);
  const toolRequests: TravelToolRequest[] = [];
  const webSearchQueries: string[] = [];
  const reasons: string[] = ["完整行程生成需要地點候選。"];

  for (const query of collectPlaceQueries(request, scopeLabel)) {
    toolRequests.push({ type: "search_place", query, locationHint: dest });
  }

  if (hasDates) {
    toolRequests.push({
      type: "weather_forecast",
      destination: dest,
      startDate: request.tripStartDate,
      endDate: request.tripEndDate || request.tripStartDate,
    });
    reasons.push("有旅遊日期，查詢天氣。");
  } else {
    reasons.push("無旅遊日期，略過天氣查詢。");
  }

  if (needsVideoResearch(request)) {
    toolRequests.push({
      type: "youtube_search",
      destination: dest,
      keyword: request.preferences.interests.join(" ") || dest,
      limit: 3,
    });
    reasons.push("使用者提及影片需求。");
  }

  if (freshnessRequired || (hasDates && serverConfig.tavilyApiKey.trim())) {
    const webQuery = `${scopeLabel} ${request.preferences.notes || ""} ${request.tripStartDate || ""}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    if (webQuery.length >= 4) {
      toolRequests.push({ type: "tavily_search", query: webQuery });
      webSearchQueries.push(webQuery);
      reasons.push("需要近期活動/官方/票價等即時資訊。");
    }
  } else if (hasDates) {
    const eventsQuery = `${scopeLabel} 活動 祭典 官方 ${request.tripStartDate || ""}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    if (eventsQuery.length >= 4) {
      webSearchQueries.push(eventsQuery);
      reasons.push("有旅遊日期，補查活動/官方資訊。");
    }
  }

  return {
    shouldResearch: true,
    toolRequests,
    webSearchQueries: webSearchQueries.slice(0, 2),
    reason: reasons.join(" "),
    freshnessRequired,
  };
}

export function shouldLoadSupplementarySources(input: {
  generatedSourceCount: number;
  freshnessRequired: boolean;
  profileNotes?: string | null;
  requireCitations?: boolean;
}): boolean {
  if (input.generatedSourceCount === 0) {
    return true;
  }
  if (input.requireCitations) {
    return true;
  }
  if (input.freshnessRequired) {
    return true;
  }
  const notes = input.profileNotes || "";
  if (/引用|來源|citation|最新|近期|官方/u.test(notes)) {
    return true;
  }
  return false;
}
