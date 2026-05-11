import type { ItineraryRouteSegment } from "@/lib/routeSegments";
import { resolveGoogleTravelMode } from "@/lib/googleDirectionsTravelMode";
import type { GoogleMapsApi } from "@/services/googleMapsLoader";

export type LatLngPoint = { lat: number; lng: number };

export type ResolvedRoutePath = {
  segment: ItineraryRouteSegment;
  path: LatLngPoint[];
  /** 是否為 Directions API 回傳的實際路徑（否則為兩點直線後備）。 */
  usedDirections: boolean;
  /** Directions 各路段时间加總（秒）；僅在 usedDirections 為 true 且可讀取 legs 時有意義。 */
  durationSeconds?: number;
};

type DirectionsLeg = { duration?: { value?: number } };
type DirectionsRouteTyped = {
  overview_path?: Array<{ lat(): number; lng(): number } | LatLngPoint>;
  legs?: DirectionsLeg[];
};

type DirectionsCallbackResult = {
  routes: DirectionsRouteTyped[];
} | null;

type DirectionsServiceInstance = {
  route: (
    request: Record<string, unknown>,
    callback: (result: DirectionsCallbackResult, status: string) => void,
  ) => void;
};

function normalizeOverviewPoint(pt: { lat(): number; lng(): number } | LatLngPoint): LatLngPoint {
  if (typeof (pt as LatLngPoint).lat === "number" && typeof (pt as LatLngPoint).lng === "number") {
    return pt as LatLngPoint;
  }
  const ll = pt as { lat: () => number; lng: () => number };
  return { lat: ll.lat(), lng: ll.lng() };
}

type MapsWithDirections = GoogleMapsApi & {
  DirectionsService?: new () => DirectionsServiceInstance;
  TravelMode?: Record<string, string>;
};

function sumLegDurationSeconds(route: DirectionsRouteTyped): number {
  const legs = route.legs;
  if (!legs?.length) {
    return 0;
  }
  let total = 0;
  for (const leg of legs) {
    const v = leg.duration?.value;
    if (typeof v === "number" && v > 0) {
      total += v;
    }
  }
  return total;
}

/**
 * 循序呼叫 DirectionsService（降低 OVER_QUERY_LIMIT 風險），失敗時以兩點直線後備。
 * 需在 Google Cloud 為同一專案金鑰啟用 Directions API（或相容的 Routes 計費別名）。
 */
export async function fetchItineraryRoutePaths(
  mapsApi: GoogleMapsApi,
  segments: ItineraryRouteSegment[],
  options: { cancelled: () => boolean; region?: string },
): Promise<ResolvedRoutePath[]> {
  const api = mapsApi as MapsWithDirections;

  if (!api.DirectionsService || !api.TravelMode) {
    return segments.map((segment) => ({
      segment,
      path: [segment.from, segment.to],
      usedDirections: false,
    }));
  }

  const service = new api.DirectionsService();
  const statusOk = "OK";
  const region = options.region ?? "tw";
  const out: ResolvedRoutePath[] = [];

  async function requestPath(
    segment: ItineraryRouteSegment,
    travelModeKey: ReturnType<typeof resolveGoogleTravelMode>,
    useTransitTime = false,
  ): Promise<{ path: LatLngPoint[]; durationSeconds: number } | null> {
    const travelMode = api.TravelMode![travelModeKey];
    if (!travelMode) {
      return null;
    }

    const request: Record<string, unknown> = {
      origin: segment.fromPlaceId ? { placeId: segment.fromPlaceId } : segment.from,
      destination: segment.toPlaceId ? { placeId: segment.toPlaceId } : segment.to,
      travelMode,
      region,
    };

    if (travelModeKey === "TRANSIT" && useTransitTime) {
      request.transitOptions = {
        departureTime: new Date(),
      };
    }

    return await new Promise<{ path: LatLngPoint[]; durationSeconds: number } | null>((resolve) => {
      try {
        service.route(request, (result, status) => {
          if (status !== statusOk || !result?.routes?.[0]) {
            resolve(null);
            return;
          }
          const route0 = result.routes[0];
          const overview = route0.overview_path;
          if (!overview?.length) {
            resolve(null);
            return;
          }
          const durationSeconds = sumLegDurationSeconds(route0);
          resolve({
            path: overview.map(normalizeOverviewPoint),
            durationSeconds,
          });
        });
      } catch {
        resolve(null);
      }
    });
  }

  for (const segment of segments) {
    if (options.cancelled()) {
      break;
    }

    const travelModeKey = resolveGoogleTravelMode(segment.transport);
    let best: { path: LatLngPoint[]; durationSeconds: number } | null = await requestPath(
      segment,
      travelModeKey,
      travelModeKey === "TRANSIT",
    );

    if (!best?.path.length && travelModeKey === "TRANSIT") {
      best = await requestPath(segment, "DRIVING", false);
    }

    if (!best?.path.length && travelModeKey === "BICYCLING") {
      best = await requestPath(segment, "DRIVING", false);
    }

    if (best && best.path.length > 0) {
      out.push({
        segment,
        path: best.path,
        usedDirections: true,
        durationSeconds: best.durationSeconds > 0 ? best.durationSeconds : undefined,
      });
    } else {
      out.push({
        segment,
        path: [segment.from, segment.to],
        usedDirections: false,
      });
    }
  }

  return out;
}
