import type { ItineraryRouteSegment } from "@/lib/routeSegments";

export function mapRouteProfile(transport: string): "walking" | "cycling" | "driving" | null {
  // Never present a road route as rail, bus, air or ferry directions.
  if (/transit|public|大眾|地鐵|捷運|mrt|metro|train|bus|jr|高鐵|台鐵|火車|公車|巴士|flight|飛機|ferry|船|mixed|混合/i.test(transport)) return null;
  if (/walk|步行|徒歩|走路/i.test(transport)) return "walking";
  if (/cycl|bike|自行車|單車|腳踏車/i.test(transport)) return "cycling";
  if (/driv|car|taxi|汽車|開車|自駕|租車|計程車|包車/i.test(transport)) return "driving";
  return null;
}

export type PresentedRoute = {
  feature: GeoJSON.Feature<GeoJSON.LineString, { color: string; schematic: boolean }>;
  minutes?: number;
};

export async function loadMapRoute(segment: ItineraryRouteSegment, signal: AbortSignal): Promise<PresentedRoute> {
  const profile = mapRouteProfile(segment.transport);
  if (profile) {
    try {
      const response = await fetch("/api/maps/route", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal,
        body: JSON.stringify({ points: [segment.from, segment.to], profile }),
      });
      const payload = await response.json();
      const route = payload.data?.route;
      if (!response.ok || route?.geometry?.type !== "LineString" || route.geometry.coordinates?.length < 2) throw new Error("Missing route");
      return {
        feature: { type: "Feature", properties: { color: segment.color, schematic: false }, geometry: route.geometry },
        ...(Number.isFinite(route.durationSeconds) && route.durationSeconds > 0
          ? { minutes: Math.max(1, Math.round(route.durationSeconds / 60)) } : {}),
      };
    } catch (error) {
      if (signal.aborted) throw error;
    }
  }
  return {
    feature: {
      type: "Feature", properties: { color: segment.color, schematic: true },
      geometry: { type: "LineString", coordinates: [[segment.from.lng, segment.from.lat], [segment.to.lng, segment.to.lat]] },
    },
  };
}
