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

  const itinerary = useTripStore.getState().itinerary;
  const day = itinerary.find((entry) => entry.dayNumber === dayNumber);
  const activityTime = time ?? nextActivityTime(day?.items ?? []);
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
  const mapState = useMapStore.getState();
  mapState.setPins([
    ...mapState.pins.filter((pin) => pin.id !== pinId),
    {
      id: pinId,
      name: location.name,
      lat: location.lat,
      lng: location.lng,
      description: location.description,
      address: location.address,
      placeId: location.placeId,
      photoUrl: location.photoUrl,
      thumbnail: location.thumbnail,
      openingHours: location.openingHours,
      phoneNumber: location.phoneNumber,
      website: location.website,
      googleMapsUrl: location.googleMapsUrl,
      rating: location.rating,
      userRatingsTotal: location.userRatingsTotal,
      source: "itinerary",
      linkedTripItemId: itemId,
      dayNumber,
      color: "#5a7ea3",
      verified: location.verified ?? true,
    },
  ]);
  mapState.setSelectedPinId(pinId);
  void syncService.flushTripSyncNow();

  return { itemId, pinId };
}
