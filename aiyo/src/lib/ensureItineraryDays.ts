import { useTripStore } from "@/stores/useTripStore";

/** Ensure itinerary has at least one day, and that `targetDayNumber` exists when provided. */
export function ensureItineraryDayCount(targetDayNumber?: number) {
  const normalizedTarget =
    typeof targetDayNumber === "number" && Number.isFinite(targetDayNumber) && targetDayNumber >= 1
      ? Math.floor(targetDayNumber)
      : null;

  if (normalizedTarget === null) {
    if (useTripStore.getState().itinerary.length === 0) {
      useTripStore.getState().addDay();
    }
    return;
  }

  const maxDay = Math.max(1, normalizedTarget);
  let guard = 0;
  while (!useTripStore.getState().itinerary.some((day) => day.dayNumber === normalizedTarget)) {
    useTripStore.getState().addDay();
    guard += 1;
    if (guard > maxDay + 3) {
      break;
    }
  }
}
