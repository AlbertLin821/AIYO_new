import type { TripPlanDay, TripPlanItem } from "@/types";

export const ITINERARY_DAY_CONTAINER_PREFIX = "day-container-";

export function itineraryDayContainerId(dayNumber: number): string {
  return `${ITINERARY_DAY_CONTAINER_PREFIX}${dayNumber}`;
}

export function parseItineraryDayContainerId(id: string): number | null {
  if (!id.startsWith(ITINERARY_DAY_CONTAINER_PREFIX)) {
    return null;
  }
  const dayNumber = Number(id.slice(ITINERARY_DAY_CONTAINER_PREFIX.length));
  return Number.isFinite(dayNumber) ? dayNumber : null;
}

export function findItineraryItemById(itinerary: TripPlanDay[], itemId: string): TripPlanItem | null {
  for (const day of itinerary) {
    const item = day.items.find((entry) => entry.id === itemId);
    if (item) {
      return item;
    }
  }
  return null;
}

export function findItineraryItemDayNumber(itinerary: TripPlanDay[], itemId: string): number | null {
  for (const day of itinerary) {
    if (day.items.some((item) => item.id === itemId)) {
      return day.dayNumber;
    }
  }
  return null;
}

export function resolveItineraryDragTarget(
  itinerary: TripPlanDay[],
  overId: string,
): { dayNumber: number; index: number } | null {
  const containerDay = parseItineraryDayContainerId(overId);
  if (containerDay != null) {
    const day = itinerary.find((entry) => entry.dayNumber === containerDay);
    return { dayNumber: containerDay, index: day?.items.length ?? 0 };
  }

  for (const day of itinerary) {
    const index = day.items.findIndex((item) => item.id === overId);
    if (index !== -1) {
      return { dayNumber: day.dayNumber, index };
    }
  }

  return null;
}
