import { zhTW as t } from "@/locales/zh-TW";
import { syncService } from "@/services/syncService";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUserStore } from "@/stores/useUserStore";
import type { TripPlanDay } from "@/types";

export function normalizeTripDayCount(value: number): number {
  if (!Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(30, Math.floor(value)));
}

export function normalizeTripBudget(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.floor(value));
}

export function getEffectiveTripDayCount(itinerary: TripPlanDay[], storedDays: number): number {
  if (itinerary.length > 0) {
    return itinerary.length;
  }
  return normalizeTripDayCount(storedDays > 0 ? storedDays : 1);
}

export function summarizeShrinkDaysImpact(
  itinerary: TripPlanDay[],
  storedDays: number,
  targetDayCount: number,
): {
  willShrink: boolean;
  fromDays: number;
  toDays: number;
  removedActivityCount: number;
} {
  const fromDays = getEffectiveTripDayCount(itinerary, storedDays);
  const toDays = normalizeTripDayCount(targetDayCount);
  if (toDays >= fromDays) {
    return { willShrink: false, fromDays, toDays, removedActivityCount: 0 };
  }

  const removedActivityCount = itinerary
    .slice(toDays)
    .reduce((count, day) => count + day.items.length, 0);

  return { willShrink: true, fromDays, toDays, removedActivityCount };
}

export async function commitTripDaysAndBudget(input: {
  days?: number;
  budget?: number;
}): Promise<void> {
  const tripStore = useTripStore.getState();
  const userStore = useUserStore.getState();
  const profilePatch: { budget?: number; travelDays?: number } = {};

  if (typeof input.days === "number") {
    const days = normalizeTripDayCount(input.days);
    tripStore.resizeItineraryToDayCount(days);
    userStore.updateProfile({ travelDays: days });
    profilePatch.travelDays = days;
  }

  if (typeof input.budget === "number") {
    const budget = normalizeTripBudget(input.budget);
    tripStore.setBudget(budget);
    userStore.updateProfile({ budget });
    profilePatch.budget = budget;
  }

  if (Object.keys(profilePatch).length === 0) {
    return;
  }

  try {
    await syncService.saveProfile(profilePatch);
  } catch (error) {
    useToastStore.getState().pushToast({
      variant: "error",
      title: t.profile.syncFailedTitle,
      description: error instanceof Error ? error.message : t.profile.syncFailedDesc,
    });
  }
}
