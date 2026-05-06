import type { TripPlanDay, TripPlanItem } from "@/types";

const DAY_ROUTE_COLORS = [
  "#4a6d91",
  "#cf6f83",
  "#6f9d73",
  "#8b75b7",
  "#d88b3d",
  "#4f9aa8",
];

export interface ItineraryRouteSegment {
  id: string;
  dayNumber: number;
  fromItemId: string;
  toItemId: string;
  fromName: string;
  toName: string;
  fromTime: string;
  toTime: string;
  transport: string;
  distanceKm: number;
  estimatedMinutes: number;
  color: string;
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function estimateDistanceKm(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function normalizeTransport(transport: string): string {
  return transport.trim().toLowerCase();
}

export function estimateTravelMinutes(distanceKm: number, transport: string): number {
  const mode = normalizeTransport(transport);
  let speedKmh = 20;
  let bufferMinutes = 6;

  if (/walk|步行|徒歩/.test(mode)) {
    speedKmh = 4.5;
    bufferMinutes = 2;
  } else if (/bike|bicycle|自行車|單車/.test(mode)) {
    speedKmh = 12;
    bufferMinutes = 3;
  } else if (/taxi|計程車|car|drive|開車|自駕/.test(mode)) {
    speedKmh = 28;
    bufferMinutes = 5;
  } else if (/metro|subway|mrt|地鐵|捷運/.test(mode)) {
    speedKmh = 22;
    bufferMinutes = 8;
  } else if (/train|rail|jr|火車|鐵路|電車/.test(mode)) {
    speedKmh = 26;
    bufferMinutes = 10;
  } else if (/bus|巴士|公車/.test(mode)) {
    speedKmh = 18;
    bufferMinutes = 8;
  }

  return Math.max(4, Math.round((distanceKm / speedKmh) * 60 + bufferMinutes));
}

function itemLocation(item: TripPlanItem) {
  if (!item.location) {
    return null;
  }
  return {
    lat: item.location.lat,
    lng: item.location.lng,
  };
}

export function buildItineraryRouteSegments(days: TripPlanDay[]): ItineraryRouteSegment[] {
  return days.flatMap((day) => {
    const locatedItems = day.items.filter((item) => item.location);
    return locatedItems.slice(1).map((item, index) => {
      const previous = locatedItems[index];
      const from = itemLocation(previous);
      const to = itemLocation(item);
      if (!from || !to) {
        return null;
      }

      const transport = item.transport?.trim() || "Mixed";
      const distanceKm = estimateDistanceKm(from, to);
      return {
        id: `day_${day.dayNumber}_${previous.id}_${item.id}`,
        dayNumber: day.dayNumber,
        fromItemId: previous.id,
        toItemId: item.id,
        fromName: previous.location?.name || previous.title,
        toName: item.location?.name || item.title,
        fromTime: previous.time,
        toTime: item.time,
        transport,
        distanceKm,
        estimatedMinutes: estimateTravelMinutes(distanceKm, transport),
        color: DAY_ROUTE_COLORS[(day.dayNumber - 1) % DAY_ROUTE_COLORS.length],
        from,
        to,
      } satisfies ItineraryRouteSegment;
    }).filter((segment): segment is ItineraryRouteSegment => Boolean(segment));
  });
}
