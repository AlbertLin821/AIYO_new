"use client";

import {
  extractDayCountFromPlanningText,
  extractDestinationFromPlanningText,
} from "@/lib/tripPlanningSignals";
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

export function extractPlanningUpdateFromText(text: string): PlanningUpdate {
  const normalized = text.trim();
  if (!normalized) {
    return {};
  }

  const destination = extractDestinationFromPlanningText(normalized);
  const daysParsed = extractDayCountFromPlanningText(normalized);
  const budgetMatch =
    normalized.match(/(?:預算|budget|TWD|NT\$|NTD)\s*[:：]?\s*(\d[\d,]*)/i) ||
    normalized.match(/(\d[\d,]*)\s*(?:元|塊|萬)/);

  const update: PlanningUpdate = {};

  if (destination) {
    update.destination = destination;
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
    tripStore.resizeItineraryToDayCount(update.days);
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
