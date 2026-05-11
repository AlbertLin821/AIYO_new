"use client";

import { useTripStore } from "@/stores/useTripStore";
import { useUserStore } from "@/stores/useUserStore";

type TripSnapshot = Pick<
  ReturnType<typeof useTripStore.getState>,
  "title" | "destination" | "days" | "budget" | "itinerary"
>;

type UserSnapshot = Pick<
  ReturnType<typeof useUserStore.getState>,
  "destination" | "travelDays" | "budget" | "interests"
>;

export type PlanningUpdate = {
  destination?: string;
  days?: number;
  budget?: number;
};

export type DerivedPlanningSnapshot = {
  destination: string;
  days: number;
  budget: number;
  plannedStopCount: number;
  hasDestination: boolean;
  hasPlannedDays: boolean;
  hasBudget: boolean;
  hasItinerary: boolean;
  hasPlanningContext: boolean;
};

const DESTINATION_REGEX =
  /(嘉義縣|嘉義市|嘉義|臺北市|台北市|臺北|台北|新北市|新北|桃園市|桃園|臺中市|台中市|臺中|台中|臺南市|台南市|臺南|台南|高雄市|高雄|屏東縣|屏東|宜蘭縣|宜蘭|花蓮縣|花蓮|臺東縣|台東縣|臺東|台東|澎湖縣|澎湖|金門縣|金門|連江縣|馬祖|墾丁|清境|日月潭|阿里山|九份|東京|大阪|京都|首爾|釜山|Tokyo|Osaka|Kyoto|Seoul|Busan)/i;

function parseChineseCardinalDays(fragment: string): number | undefined {
  const trimmed = fragment.trim();
  if (!trimmed) {
    return undefined;
  }
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? Math.max(1, Math.min(n, 30)) : undefined;
  }

  const digit: Record<string, number> = {
    "〇": 0,
    "零": 0,
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
  };

  if (trimmed === "兩" || trimmed === "貳") {
    return 2;
  }
  if (trimmed === "十") {
    return 10;
  }
  if (trimmed === "廿") {
    return 20;
  }
  if (trimmed === "卅") {
    return 30;
  }
  if (trimmed === "二十") {
    return 20;
  }
  if (trimmed === "三十") {
    return 30;
  }

  if (trimmed.length === 1) {
    const v = digit[trimmed];
    if (v !== undefined && v >= 1) {
      return v;
    }
  }

  if (trimmed.startsWith("十") && trimmed.length === 2) {
    const u = digit[trimmed[1]];
    if (u !== undefined) {
      return Math.min(10 + u, 30);
    }
  }
  if (trimmed.startsWith("廿") && trimmed.length === 2) {
    const u = digit[trimmed[1]];
    if (u !== undefined) {
      return Math.min(20 + u, 30);
    }
  }
  if (trimmed.startsWith("二十") && trimmed.length === 3) {
    const u = digit[trimmed[2]];
    if (u !== undefined) {
      return Math.min(20 + u, 30);
    }
  }
  if (trimmed.startsWith("三十") && trimmed.length === 3) {
    const u = digit[trimmed[2]];
    if (u !== undefined) {
      return Math.min(30 + u, 30);
    }
  }

  return undefined;
}

/** 解析「三天」「五日」「三天兩夜」等口語行程天數（不含預算「元」誤判）。 */
function extractDayCountFromPlanningText(normalized: string): number | undefined {
  const arabicMatch =
    normalized.match(/(\d{1,2})\s*(?:天|日)(?!幣)/) ||
    normalized.match(/(?:for|stay|trip)\s+(\d{1,2})\s+days?/i);
  if (arabicMatch?.[1]) {
    return Math.max(1, Math.min(Number(arabicMatch[1]), 30));
  }

  const chineseMatch = normalized.match(/([一二三四五六七八九十兩廿卅]{1,3})\s*天/);
  if (!chineseMatch?.[1]) {
    return undefined;
  }

  const parsed = parseChineseCardinalDays(chineseMatch[1]);
  return parsed !== undefined ? Math.max(1, Math.min(parsed, 30)) : undefined;
}

export function extractPlanningUpdateFromText(text: string): PlanningUpdate {
  const normalized = text.trim();
  if (!normalized) {
    return {};
  }

  const destinationMatch = normalized.match(DESTINATION_REGEX);
  const daysParsed = extractDayCountFromPlanningText(normalized);
  const budgetMatch =
    normalized.match(/(?:預算|budget|TWD|NT\$|NTD)\s*[:：]?\s*(\d[\d,]*)/i) ||
    normalized.match(/(\d[\d,]*)\s*(?:元|塊|萬)/);

  const update: PlanningUpdate = {};

  if (destinationMatch?.[1]) {
    update.destination = destinationMatch[1].trim();
  }
  if (daysParsed !== undefined) {
    update.days = daysParsed;
  }
  if (budgetMatch?.[1]) {
    const parsed = Number(budgetMatch[1].replace(/,/g, ""));
    if (Number.isFinite(parsed) && parsed > 0) {
      update.budget = parsed;
    }
  }

  return update;
}

export function applyPlanningUpdateToStores(update: PlanningUpdate): void {
  const tripStore = useTripStore.getState();
  const userStore = useUserStore.getState();

  if (update.destination) {
    tripStore.setDestination(update.destination);
  }
  if (typeof update.days === "number") {
    tripStore.setDays(update.days);
  }
  if (typeof update.budget === "number") {
    tripStore.setBudget(update.budget);
  }

  if (update.destination || typeof update.days === "number" || typeof update.budget === "number") {
    userStore.updateProfile({
      ...(update.destination ? { destination: update.destination } : {}),
      ...(typeof update.days === "number" ? { travelDays: update.days } : {}),
      ...(typeof update.budget === "number" ? { budget: update.budget } : {}),
    });
  }
}

export function derivePlanningSnapshot(input: {
  trip: TripSnapshot;
  user: UserSnapshot;
  pinCount?: number;
}): DerivedPlanningSnapshot {
  const plannedStopCount = input.trip.itinerary.reduce(
    (count, day) => count + day.items.length,
    0,
  );
  const pinCount = input.pinCount ?? 0;
  const hasItinerary = plannedStopCount > 0 || pinCount > 0;
  const tripHasScaffoldOnly =
    !hasItinerary &&
    input.trip.days <= 1 &&
    input.trip.budget <= 0 &&
    !input.user.destination.trim() &&
    input.user.travelDays <= 1 &&
    input.user.budget <= 0;

  const destination = hasItinerary
    ? input.trip.destination.trim() || input.user.destination.trim()
    : input.user.destination.trim() || (tripHasScaffoldOnly ? "" : input.trip.destination.trim());
  const days =
    hasItinerary || input.trip.days > 1
      ? input.trip.days
      : input.user.travelDays > 1
        ? input.user.travelDays
        : input.trip.days;
  const budget = input.trip.budget > 0 ? input.trip.budget : input.user.budget;

  const hasDestination = Boolean(destination);
  const hasBudget = budget > 0;
  const hasPlannedDays = hasItinerary || days > 1;

  return {
    destination,
    days,
    budget,
    plannedStopCount,
    hasDestination,
    hasPlannedDays,
    hasBudget,
    hasItinerary,
    hasPlanningContext: hasDestination || hasPlannedDays || hasBudget || hasItinerary,
  };
}

/** 從使用者訊息擷取 ISO 日期（yyyy-mm-dd），供天氣與活動檢索。 */
export function extractIsoDateRangeFromText(text: string): {
  tripStartDate?: string;
  tripEndDate?: string;
} {
  const matches = text.match(/\d{4}-\d{2}-\d{2}/g);
  if (!matches?.length) {
    return {};
  }
  const tripStartDate = matches[0];
  const tripEndDate = matches.length > 1 ? matches[matches.length - 1] : tripStartDate;
  return { tripStartDate, tripEndDate };
}
