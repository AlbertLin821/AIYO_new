import type { TripPlanDay, TripPlanItem } from "@/types";
import { isUsableMapCoordinate } from "@/lib/geoCoordinates";

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
  /** 若為 Google Places place_id，路線規劃會優先使用，較接近 Maps 導航結果。 */
  fromPlaceId?: string;
  toPlaceId?: string;
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

function segmentTransportKey(transport: string): string {
  return normalizeTransport(transport).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "transit";
}

export function estimateTravelMinutes(distanceKm: number, transport: string): number {
  const mode = normalizeTransport(transport);
  let speedKmh = 20;
  let bufferMinutes = 6;

  if (/^walking$|^walk$|步行|徒歩|走路/.test(mode)) {
    speedKmh = 4.5;
    bufferMinutes = 2;
  } else if (/bicycling|^bike$|bicycle|自行車|單車|腳踏車|cycling/.test(mode)) {
    speedKmh = 12;
    bufferMinutes = 3;
  } else if (/^driving|^transit|drive|汽車|開車|自駕|租車|taxi|計程車|car|大眾|地鐵|捷運|mrt|metro|train|bus|jr|高鐵|台鐵|火車|混合|mixed/.test(mode)) {
    if (/^driving|drive|汽車|開車|自駕|租車|taxi|計程車|^car$/.test(mode)) {
      speedKmh = 28;
      bufferMinutes = 5;
    } else {
      speedKmh = 22;
      bufferMinutes = 8;
    }
  }

  return Math.max(4, Math.round((distanceKm / speedKmh) * 60 + bufferMinutes));
}

function itemLocation(item: TripPlanItem) {
  if (!item.location) {
    return null;
  }
  if (!isUsableMapCoordinate(item.location.lat, item.location.lng)) {
    return null;
  }
  return {
    lat: item.location.lat,
    lng: item.location.lng,
  };
}

export function buildItineraryRouteSegments(days: TripPlanDay[]): ItineraryRouteSegment[] {
  return days.flatMap((day) => {
    const locatedItems = day.items.filter(
      (item) => item.location && isUsableMapCoordinate(item.location.lat, item.location.lng),
    );
    return locatedItems.slice(1).map((item, index) => {
      const previous = locatedItems[index];
      const from = itemLocation(previous);
      const to = itemLocation(item);
      if (!from || !to) {
        return null;
      }

      const transport = item.transport?.trim() || "Transit";
      const distanceKm = estimateDistanceKm(from, to);
      const legColor = DAY_ROUTE_COLORS[index % DAY_ROUTE_COLORS.length];
      return {
        id: `day_${day.dayNumber}_${previous.id}_${item.id}_${segmentTransportKey(transport)}_${previous.time}_${item.time}`,
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
        color: legColor,
        from,
        to,
        ...(previous.location?.placeId ? { fromPlaceId: previous.location.placeId } : {}),
        ...(item.location?.placeId ? { toPlaceId: item.location.placeId } : {}),
      } satisfies ItineraryRouteSegment;
    }).filter((segment): segment is ItineraryRouteSegment => segment !== null);
  });
}
