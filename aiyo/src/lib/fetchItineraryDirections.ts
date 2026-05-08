import type { ItineraryRouteSegment } from "@/lib/routeSegments";
import { resolveGoogleTravelMode } from "@/lib/googleDirectionsTravelMode";
import type { GoogleMapsApi } from "@/services/googleMapsLoader";

export type LatLngPoint = { lat: number; lng: number };

export type ResolvedRoutePath = {
  segment: ItineraryRouteSegment;
  path: LatLngPoint[];
  /** 是否為 Directions API 回傳的實際路徑（否則為兩點直線後備）。 */
  usedDirections: boolean;
};

type DirectionsCallbackResult = {
  routes: Array<{ overview_path?: Array<{ lat(): number; lng(): number } | LatLngPoint> }>;
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
  ): Promise<LatLngPoint[] | null> {
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

    return await new Promise<LatLngPoint[] | null>((resolve) => {
      try {
        service.route(request, (result, status) => {
          if (status !== statusOk || !result?.routes?.[0]?.overview_path?.length) {
            resolve(null);
            return;
          }
          const overview = result.routes[0].overview_path;
          resolve(overview.map(normalizeOverviewPoint));
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
    let path: LatLngPoint[] | null = await requestPath(segment, travelModeKey, travelModeKey === "TRANSIT");

    if (!path?.length && travelModeKey === "TRANSIT") {
      path = await requestPath(segment, "DRIVING", false);
    }

    if (!path?.length && travelModeKey === "BICYCLING") {
      path = await requestPath(segment, "DRIVING", false);
    }

    if (path && path.length > 0) {
      out.push({ segment, path, usedDirections: true });
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
