import {
  getItineraryItemTitleViolation,
  isMealSyntheticTitle,
  isSyntheticFallbackPlaceName,
} from "@/lib/itineraryPlaceTitle";

export const INSUFFICIENT_RESEARCH_WARNING = "目前搜尋資料不足";
export const INSUFFICIENT_RESEARCH_TRAVEL_PLAN_WARNING =
  "目前搜尋資料不足，以下行程僅根據可驗證地點建立，建議出發前再次確認。";

export const requiredTripFields = [
  "destination",
  "duration_days",
  "duration_nights",
  "companions",
  "traveler_count",
  "budget",
  "pace",
  "interests",
  "transportation",
] as const;

export type TripDayRole = "arrival" | "main" | "departure" | "middle";

export function resolveTripDayRole(dayNumber: number, totalDays: number): TripDayRole {
  if (dayNumber <= 1) {
    return "arrival";
  }
  if (dayNumber >= totalDays) {
    return "departure";
  }
  if (dayNumber === 2 && totalDays >= 3) {
    return "main";
  }
  return "middle";
}

export const dailyTimeBlockStandard = {
  arrival:
    "Day 1 is arrival day: keep the schedule lighter, reserve transport and check-in buffer, avoid stacking too many core attractions.",
  main: "Day 2 is the main sightseeing day: core attractions and signature meals can be scheduled here.",
  departure:
    "Final day is departure day: half-day route, souvenir stop, and return transport; avoid late-night activities.",
  middle: "Middle days follow a balanced sightseeing rhythm with realistic transfer time between areas.",
} as const;

export const itemCountStandard = {
  defaultMin: 4,
  defaultMax: 7,
  arrivalMin: 3,
  arrivalMax: 5,
  mainMax: 7,
  departureMin: 3,
  departureMax: 6,
  departureLastItemLatestMinutes: 17 * 60,
} as const;

export const mealStandard = {
  lunchWindow: { start: "12:00", end: "13:30" },
  dinnerWindow: { start: "18:00", end: "19:30" },
  genericMealTitles: ["午餐", "晚餐", "Lunch", "Dinner"] as const,
  threeDayTwoNightRequiredMeals: [
    { dayNumber: 1, kind: "dinner" as const },
    { dayNumber: 2, kind: "lunch" as const },
    { dayNumber: 2, kind: "dinner" as const },
    { dayNumber: 3, kind: "lunch" as const },
  ],
} as const;

export const transportStandard = {
  meaning: "Each item transport field describes how to move from the previous stop to this stop.",
  noModelMinutes: "Do not invent precise travel minutes in JSON; route duration is added by backend providers.",
  spatialCoherence: "Keep same-day routes spatially coherent; avoid cross-city ping-pong unless explicitly requested.",
} as const;

export const forbiddenPlaceholderTitles = [
  "市區自由探索",
  "河岸散策",
  "文創街區漫步",
  "文創街區",
  "夜景收尾",
  "在地市場",
  "代表性景點",
  "文化體驗",
  "特色街區",
  "在地美食",
  "夜景或河岸",
  "old town walk",
  "riverside stroll",
  "creative district",
  "local market",
  "evening viewpoint",
  "landmark",
  "cultural stop",
  "neighborhood walk",
  "local food",
] as const;

export const titleStandard = {
  singleSearchablePlace: true,
  forbidMultiPlaceSeparators: ["・", "、", "/", "／", " 與 ", " and "],
  forbidInterestPrefix: true,
  forbidMealSuffixInTitle: true,
  forbiddenPlaceholders: forbiddenPlaceholderTitles,
} as const;

export const searchStandard = {
  chatAdviceNoSearch:
    "General travel advice or first-time suitability questions do not require web search unless fresh facts are requested.",
  mustSearchTopics: [
    "opening_hours",
    "ticket_price",
    "weather",
    "events",
    "transportation",
    "official_source",
    "fresh_info",
  ],
  fullTripWithDates: "When trip dates exist, query weather and events/official notices at minimum.",
  fullTripWithoutDates: "When trip dates are missing, query POI/restaurant candidates only; do not force live weather.",
} as const;

export function isGenericMealTitle(title: string): boolean {
  const trimmed = title.trim();
  return mealStandard.genericMealTitles.some((value) => value === trimmed);
}

export function isForbiddenPlaceholderTitle(title: string, destination?: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) {
    return false;
  }
  const normalized = trimmed.toLowerCase();
  if (forbiddenPlaceholderTitles.some((value) => normalized.includes(value.toLowerCase()))) {
    return true;
  }
  if (destination?.trim()) {
    const dest = destination.trim();
    if (
      new RegExp(`^${escapeRegExp(dest)}\\s*(代表性景點|文化體驗|特色街區|在地美食|夜景或河岸)$`, "u").test(
        trimmed,
      )
    ) {
      return true;
    }
  }
  return isSyntheticFallbackPlaceName(trimmed) || Boolean(getItineraryItemTitleViolation(trimmed));
}

export function getDayItemCountBounds(dayNumber: number, totalDays: number): { min: number; max: number } {
  const role = resolveTripDayRole(dayNumber, totalDays);
  if (role === "arrival") {
    return { min: itemCountStandard.arrivalMin, max: itemCountStandard.arrivalMax };
  }
  if (role === "departure") {
    return { min: itemCountStandard.departureMin, max: itemCountStandard.departureMax };
  }
  if (role === "main") {
    return { min: itemCountStandard.defaultMin, max: itemCountStandard.mainMax };
  }
  return { min: itemCountStandard.defaultMin, max: itemCountStandard.defaultMax };
}

export function suggestedMealTime(kind: "lunch" | "dinner"): string {
  return kind === "lunch" ? "12:30" : "18:30";
}

export function mealRequiresAreaNotes(title: string, notes?: string | null): boolean {
  if (!isGenericMealTitle(title) && !isMealSyntheticTitle(title)) {
    return false;
  }
  return !(notes || "").trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function formatItineraryPlanningStandardForPrompt(): string {
  return [
    "AIYO ITINERARY PLANNING STANDARD:",
    `- Required trip inputs: ${requiredTripFields.join(", ")}.`,
    `- Day rhythm: ${dailyTimeBlockStandard.arrival}`,
    `- Day rhythm: ${dailyTimeBlockStandard.main}`,
    `- Day rhythm: ${dailyTimeBlockStandard.departure}`,
    `- Item count: ${itemCountStandard.defaultMin}-${itemCountStandard.defaultMax} per day; Day 1 ${itemCountStandard.arrivalMin}-${itemCountStandard.arrivalMax}; final day last item before 17:00.`,
    `- Meals: lunch ${mealStandard.lunchWindow.start}-${mealStandard.lunchWindow.end}, dinner ${mealStandard.dinnerWindow.start}-${mealStandard.dinnerWindow.end}.`,
    "- For 3-day/2-night trips include Day 1 dinner, Day 2 lunch+dinner, Day 3 lunch.",
    "- Generic meal titles (午餐/晚餐) are allowed only when notes describe the dining area.",
    `- Transport: ${transportStandard.meaning} ${transportStandard.noModelMinutes}`,
    `- Titles: one searchable place/venue only; no multi-stop joins; no placeholders such as ${forbiddenPlaceholderTitles.slice(0, 5).join("、")}.`,
    "- Put interests in theme/notes, never as title prefixes.",
    "- If verified research is insufficient, add warnings with 目前搜尋資料不足 instead of inventing POIs.",
  ].join("\n");
}
