import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { estimateDistanceKm, estimateTravelMinutes } from "@/lib/routeSegments";
import { inferTransportModeForDistance } from "@/lib/transportPreference";
import type { TripPlanDay, TripPlanItem } from "@/types";

function isGenericTransportValue(value: string | undefined): boolean {
  const normalized = value?.trim().toLowerCase() || "";
  return !normalized || normalized === "ai_recommend" || normalized.includes("ai 建議");
}

function itemCoordinates(item: TripPlanItem): { lat: number; lng: number } | null {
  if (!item.location || !hasUsableMapCoordinate(item.location)) {
    return null;
  }
  return { lat: item.location.lat, lng: item.location.lng };
}

function withTransportPatch(
  previous: TripPlanItem,
  item: TripPlanItem,
  destination: string,
  preferredTransport?: string | null,
): TripPlanItem {
  const from = itemCoordinates(previous);
  const to = itemCoordinates(item);
  const distanceKm = from && to ? estimateDistanceKm(from, to) : undefined;
  const transport = inferTransportModeForDistance({
    destination,
    preferredTransport,
    distanceKm,
  });

  return {
    ...item,
    transport,
    transportDurationMinutes:
      typeof distanceKm === "number" && Number.isFinite(distanceKm)
        ? estimateTravelMinutes(distanceKm, transport)
        : item.transportDurationMinutes,
    transportDistanceMeters:
      typeof distanceKm === "number" && Number.isFinite(distanceKm)
        ? Math.round(distanceKm * 1000)
        : item.transportDistanceMeters,
    transportDataSource: undefined,
  };
}

export function hydrateItineraryTransportFields(
  days: TripPlanDay[],
  options: {
    destination: string;
    preferredTransport?: string | null;
  },
): TripPlanDay[] {
  return days.map((day) => ({
    ...day,
    items: day.items.map((item, index) => {
      if (index === 0) {
        return item;
      }
      const previous = day.items[index - 1];
      if (!previous) {
        return item;
      }
      const missingMode = isGenericTransportValue(item.transport);
      const missingDuration =
        typeof item.transportDurationMinutes !== "number" || item.transportDurationMinutes <= 0;
      const missingDistance =
        typeof item.transportDistanceMeters !== "number" || item.transportDistanceMeters <= 0;
      if (!missingMode && !missingDuration && !missingDistance) {
        return item;
      }
      return withTransportPatch(previous, item, options.destination, options.preferredTransport);
    }),
  }));
}
