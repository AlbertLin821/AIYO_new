import { ensureItineraryDayCount } from "@/lib/ensureItineraryDays";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { syncService } from "@/services/syncService";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import type { LocationReference, TripPlanDay, TripPlanItem } from "@/types";

export function nextActivityTime(items: TripPlanItem[]): string {
  const lastTime = [...items]
    .reverse()
    .map((item) => item.time?.slice(0, 5))
    .find((value) => value && /^\d{2}:\d{2}$/.test(value));
  if (!lastTime) {
    return "16:00";
  }
  const [hour, minute] = lastTime.split(":").map(Number);
  return `${String(Math.min(23, hour + 1)).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function itineraryHasPlaceId(itinerary: TripPlanDay[], placeId: string): boolean {
  const normalized = placeId.trim();
  if (!normalized) {
    return false;
  }
  return itinerary.some((day) =>
    day.items.some((item) => item.location?.placeId?.trim() === normalized),
  );
}

export type AddPlaceToItineraryInput = {
  dayNumber: number;
  location: LocationReference;
  itemId: string;
  title?: string;
  notes?: string;
  time?: string;
  source?: TripPlanItem["source"];
};

export function addPlaceToItinerary(input: AddPlaceToItineraryInput): { itemId: string; pinId: string } {
  const { dayNumber, location, itemId, title, notes, time, source = "manual" } = input;
  if (!hasUsableMapCoordinate(location)) {
    throw new Error("地點座標無效。");
  }

  ensureItineraryDayCount(dayNumber);

  const itinerary = useTripStore.getState().itinerary;
  const day = itinerary.find((entry) => entry.dayNumber === dayNumber);
  if (!day) {
    throw new Error("無法建立行程天數，請稍後再試。");
  }

  const activityTime = time ?? nextActivityTime(day.items);
  const itemTitle = (title ?? location.name).trim() || location.name;

  useTripStore.getState().addItineraryItem(dayNumber, {
    id: itemId,
    dayNumber,
    time: activityTime,
    title: itemTitle,
    type: "activity",
    notes: notes ?? location.address ?? location.description,
    location,
    source,
  });

  const pinId = `day_${dayNumber}_${itemId}`;
  useMapStore.getState().setSelectedPinId(pinId);
  void syncService.flushTripSyncNow();

  return { itemId, pinId };
}
