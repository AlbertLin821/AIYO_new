import type { ItineraryRouteSegment } from "@/lib/routeSegments";
import { resolveGoogleTravelMode } from "@/lib/googleDirectionsTravelMode";
import type { GoogleMapsApi } from "@/services/googleMapsLoader";

export type LatLngPoint = { lat: number; lng: number };

export type ResolvedRoutePath = {
  segment: ItineraryRouteSegment;
  path: LatLngPoint[];
  /** 是否為 Google 路線服務回傳的實際路徑（否則為兩點直線後備）。 */
  usedDirections: boolean;
  /** 路線總時間（秒）；僅在 usedDirections 為 true 時有意義。 */
  durationSeconds?: number;
};

type MapsWithImport = GoogleMapsApi & {
  importLibrary?: (name: string) => Promise<Record<string, unknown>>;
  TravelMode?: Record<string, string>;
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

type MapsWithDirections = GoogleMapsApi & {
  DirectionsService?: new () => DirectionsServiceInstance;
  TravelMode?: Record<string, string>;
};

type RouteComputeResult = {
  routes?: Array<{
    path?: unknown[];
    durationMillis?: number;
  }>;
};

let cachedRouteCompute: { computeRoutes: (req: Record<string, unknown>) => Promise<RouteComputeResult> } | null = null;

function normalizeOverviewPoint(pt: { lat(): number; lng(): number } | LatLngPoint): LatLngPoint {
  if (typeof (pt as LatLngPoint).lat === "number" && typeof (pt as LatLngPoint).lng === "number") {
    return pt as LatLngPoint;
  }
  const ll = pt as { lat: () => number; lng: () => number };
  return { lat: ll.lat(), lng: ll.lng() };
}

function normalizePathPoint(pt: unknown): LatLngPoint | null {
  if (pt == null || typeof pt !== "object") {
    return null;
  }
  const o = pt as Record<string, unknown>;
  if (typeof o.lat === "number" && typeof o.lng === "number") {
    return { lat: o.lat, lng: o.lng };
  }
  if (typeof o.latitude === "number" && typeof o.longitude === "number") {
    return { lat: o.latitude, lng: o.longitude };
  }
  const latFn = o.lat as (() => number) | undefined;
  const lngFn = o.lng as (() => number) | undefined;
  if (typeof latFn === "function" && typeof lngFn === "function") {
    return { lat: latFn.call(pt), lng: lngFn.call(pt) };
  }
  return null;
}

function pathFromRoute(route: { path?: unknown[] } | undefined): LatLngPoint[] {
  const pts = route?.path;
  if (!Array.isArray(pts) || pts.length === 0) {
    return [];
  }
  const out: LatLngPoint[] = [];
  for (const p of pts) {
    const n = normalizePathPoint(p);
    if (n) {
      out.push(n);
    }
  }
  return out;
}

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

/** Routes API 慣用 latitude／longitude；部分環境亦接受 lat／lng。 */
function buildComputeRoutesWaypoint(segment: ItineraryRouteSegment, end: "from" | "to"): Record<string, unknown> {
  const latlng = end === "from" ? segment.from : segment.to;
  const placeId = end === "from" ? segment.fromPlaceId : segment.toPlaceId;
  if (placeId) {
    return { location: { placeId } };
  }
  return {
    location: {
      latLng: {
        latitude: latlng.lat,
        longitude: latlng.lng,
      },
    },
  };
}

/**
 * 優先使用 Routes Library `Route.computeRoutes`；失敗或無路徑時改用 `DirectionsService`（仍為官方支援，僅顯示棄用提醒）。
 * 確保回傳陣列長度與 `segments` 一致，避免與地圖 polyline 錯位。
 */
export async function fetchItineraryRoutePaths(
  mapsApi: GoogleMapsApi,
  segments: ItineraryRouteSegment[],
  options: { cancelled: () => boolean; region?: string },
): Promise<ResolvedRoutePath[]> {
  const api = mapsApi as MapsWithImport & MapsWithDirections;
  const region = options.region ?? "tw";
  const statusOk = "OK";

  let RouteClass: { computeRoutes: (req: Record<string, unknown>) => Promise<RouteComputeResult> } | null =
    cachedRouteCompute;
  if (!RouteClass && typeof api.importLibrary === "function") {
    try {
      const routesLib = await api.importLibrary("routes");
      const R = routesLib.Route as
        | { computeRoutes?: (req: Record<string, unknown>) => Promise<RouteComputeResult> }
        | undefined;
      if (R?.computeRoutes) {
        RouteClass = R as { computeRoutes: (req: Record<string, unknown>) => Promise<RouteComputeResult> };
        cachedRouteCompute = RouteClass;
      }
    } catch {
      RouteClass = null;
    }
  }

  async function requestPathComputeRoutes(
    segment: ItineraryRouteSegment,
    travelModeKey: ReturnType<typeof resolveGoogleTravelMode>,
    useTransitTime: boolean,
  ): Promise<{ path: LatLngPoint[]; durationSeconds: number } | null> {
    if (!RouteClass) {
      return null;
    }
    const travelMode = api.TravelMode?.[travelModeKey] ?? travelModeKey;
    const request: Record<string, unknown> = {
      origin: buildComputeRoutesWaypoint(segment, "from"),
      destination: buildComputeRoutesWaypoint(segment, "to"),
      travelMode,
      region,
      fields: ["durationMillis", "path"],
    };
    if (travelModeKey === "TRANSIT" && useTransitTime) {
      request.departureTime = new Date();
    }
    try {
      const { routes } = await RouteClass.computeRoutes(request);
      const route0 = routes?.[0];
      const path = pathFromRoute(route0);
      if (!path.length) {
        return null;
      }
      const durationMillis = typeof route0?.durationMillis === "number" ? route0.durationMillis : 0;
      const durationSeconds = durationMillis > 0 ? Math.round(durationMillis / 1000) : 0;
      return { path, durationSeconds };
    } catch {
      return null;
    }
  }

  async function requestPathDirectionsLegacy(
    segment: ItineraryRouteSegment,
    travelModeKey: ReturnType<typeof resolveGoogleTravelMode>,
    useTransitTime: boolean,
  ): Promise<{ path: LatLngPoint[]; durationSeconds: number } | null> {
    if (!api.DirectionsService || !api.TravelMode) {
      return null;
    }
    const travelMode = api.TravelMode[travelModeKey];
    if (!travelMode) {
      return null;
    }
    const service = new api.DirectionsService();
    const request: Record<string, unknown> = {
      origin: segment.fromPlaceId ? { placeId: segment.fromPlaceId } : segment.from,
      destination: segment.toPlaceId ? { placeId: segment.toPlaceId } : segment.to,
      travelMode,
      region,
    };
    if (travelModeKey === "TRANSIT" && useTransitTime) {
      request.transitOptions = { departureTime: new Date() };
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

  async function requestPath(
    segment: ItineraryRouteSegment,
    travelModeKey: ReturnType<typeof resolveGoogleTravelMode>,
    useTransitTime: boolean,
  ): Promise<{ path: LatLngPoint[]; durationSeconds: number } | null> {
    let best = await requestPathComputeRoutes(segment, travelModeKey, useTransitTime);
    if (!best?.path.length) {
      best = await requestPathDirectionsLegacy(segment, travelModeKey, useTransitTime);
    }
    return best;
  }

  const out: ResolvedRoutePath[] = [];

  for (let i = 0; i < segments.length; i++) {
    if (options.cancelled()) {
      while (out.length < segments.length) {
        const seg = segments[out.length];
        out.push({
          segment: seg,
          path: [seg.from, seg.to],
          usedDirections: false,
        });
      }
      break;
    }

    const segment = segments[i]!;
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
