import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import type { MapFocusLocation } from "@/stores/useMapStore";
import type { MapPin, TripPlanDay } from "@/types";

export const DEFAULT_MAP_TW_CENTER = { lat: 23.62, lng: 121.0 };
export const DEFAULT_MAP_TW_ZOOM = 8;

export type MapViewportPoint = { lat: number; lng: number };

function addViewportPoint(
  points: MapViewportPoint[],
  seen: Set<string>,
  lat: number,
  lng: number,
) {
  if (!hasUsableMapCoordinate({ lat, lng })) {
    return;
  }
  const key = `${lat.toFixed(5)}:${lng.toFixed(5)}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  points.push({ lat, lng });
}

/** Pins first; if none, use itinerary item coordinates (before pins reconcile). */
export function collectMapViewportPoints(
  pins: MapPin[],
  itinerary: TripPlanDay[],
): MapViewportPoint[] {
  const points: MapViewportPoint[] = [];
  const seen = new Set<string>();

  for (const pin of pins) {
    addViewportPoint(points, seen, pin.lat, pin.lng);
  }
  if (points.length > 0) {
    return points;
  }

  for (const day of itinerary) {
    for (const item of day.items) {
      if (!item.location) {
        continue;
      }
      addViewportPoint(points, seen, item.location.lat, item.location.lng);
    }
  }

  return points;
}

export function focusLocationToPoint(focus: MapFocusLocation): MapViewportPoint | null {
  if (!focus || focus.lat == null || focus.lng == null) {
    return null;
  }
  if (!hasUsableMapCoordinate({ lat: focus.lat, lng: focus.lng })) {
    return null;
  }
  return { lat: focus.lat, lng: focus.lng };
}

/** Taiwan default only when there is no active trip context to frame. */
export function shouldUseTaiwanDefaultViewport(input: {
  tripId: string | null | undefined;
  destination: string | null | undefined;
  points: MapViewportPoint[];
  focusLocation: MapFocusLocation;
}): boolean {
  if (input.points.length > 0) {
    return false;
  }
  if (focusLocationToPoint(input.focusLocation)) {
    return false;
  }
  if (input.tripId?.trim()) {
    return false;
  }
  if (input.destination?.trim()) {
    return false;
  }
  return true;
}

/** Stable key for pin id + coordinates — order/metadata changes are ignored. */
export function pinsGeometryKey(pins: MapPin[]): string {
  return pins
    .map((pin) => `${pin.id}:${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`)
    .sort()
    .join("|");
}

export function getMockLatLngRanges(points: MapViewportPoint[]): {
  latRange: { min: number; max: number };
  lngRange: { min: number; max: number };
} {
  const MOCK_TW_LAT_RANGE = { min: 21.95, max: 25.35 };
  const MOCK_TW_LNG_RANGE = { min: 119.35, max: 122.05 };

  if (points.length === 0) {
    return { latRange: MOCK_TW_LAT_RANGE, lngRange: MOCK_TW_LNG_RANGE };
  }

  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  return {
    latRange: { min: Math.min(...lats) - 0.012, max: Math.max(...lats) + 0.012 },
    lngRange: { min: Math.min(...lngs) - 0.012, max: Math.max(...lngs) + 0.012 },
  };
}
