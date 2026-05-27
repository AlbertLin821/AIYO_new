import { resolveGoogleTravelMode } from "@/lib/googleDirectionsTravelMode";
import { buildItineraryRouteSegments } from "@/lib/routeSegments";
import { serverConfig } from "@/server/config";
import type { TripPlanResult } from "@/types";

type GoogleRoutesResponse = {
  routes?: Array<{
    duration?: string;
    distanceMeters?: number;
  }>;
};

const GOOGLE_ROUTES_TIMEOUT_MS = 4000;
const GOOGLE_ROUTES_MAX_SEGMENTS = 8;

function parseGoogleDurationSeconds(value: string | undefined): number | null {
  const match = value?.trim().match(/^(\d+(?:\.\d+)?)s$/);
  if (!match) {
    return null;
  }
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

function buildWaypoint(point: { lat: number; lng: number }, placeId?: string) {
  if (placeId) {
    return { placeId };
  }
  return {
    location: {
      latLng: {
        latitude: point.lat,
        longitude: point.lng,
      },
    },
  };
}

async function fetchGoogleRouteDuration(input: {
  from: { lat: number; lng: number };
  to: { lat: number; lng: number };
  fromPlaceId?: string;
  toPlaceId?: string;
  transport: string;
}): Promise<{ durationMinutes: number; distanceMeters?: number } | null> {
  if (!serverConfig.googleMapsApiKey) {
    return null;
  }

  const travelMode = resolveGoogleTravelMode(input.transport);
  const requestBody: Record<string, unknown> = {
    origin: buildWaypoint(input.from, input.fromPlaceId),
    destination: buildWaypoint(input.to, input.toPlaceId),
    travelMode,
  };
  if (travelMode === "TRANSIT") {
    requestBody.departureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GOOGLE_ROUTES_TIMEOUT_MS);
  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": serverConfig.googleMapsApiKey,
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters",
    },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    return null;
  }

  const json = (await response.json()) as GoogleRoutesResponse;
  const first = json.routes?.[0];
  const seconds = parseGoogleDurationSeconds(first?.duration);
  if (!seconds) {
    return null;
  }
  return {
    durationMinutes: Math.max(1, Math.round(seconds / 60)),
    distanceMeters:
      typeof first?.distanceMeters === "number" && first.distanceMeters > 0
        ? Math.round(first.distanceMeters)
        : undefined,
  };
}

export async function enrichTripPlanWithRouteTravelTimes(plan: TripPlanResult): Promise<TripPlanResult> {
  if (!serverConfig.googleMapsApiKey) {
    return plan;
  }

  const segments = buildItineraryRouteSegments(plan.days);
  if (!segments.length) {
    return plan;
  }

  const patches = new Map<string, {
    durationMinutes: number;
    distanceMeters?: number;
  }>();

  const lookups = await Promise.allSettled(
    segments.slice(0, GOOGLE_ROUTES_MAX_SEGMENTS).map(async (segment) => ({
      segment,
      result: await fetchGoogleRouteDuration({
        from: segment.from,
        to: segment.to,
        fromPlaceId: segment.fromPlaceId,
        toPlaceId: segment.toPlaceId,
        transport: segment.transport,
      }),
    })),
  );

  for (const lookup of lookups) {
    if (lookup.status === "rejected") {
      console.warn("[route-travel-time] google route lookup failed", {
        error: lookup.reason instanceof Error ? lookup.reason.message : String(lookup.reason),
      });
      continue;
    }
    if (lookup.value.result) {
      patches.set(`${lookup.value.segment.dayNumber}:${lookup.value.segment.toItemId}`, lookup.value.result);
    }
  }

  if (patches.size === 0) {
    return plan;
  }

  return {
    ...plan,
    days: plan.days.map((day) => ({
      ...day,
      items: day.items.map((item) => {
        const patch = patches.get(`${day.dayNumber}:${item.id}`);
        if (!patch) {
          return item;
        }
        return {
          ...item,
          transportDurationMinutes: patch.durationMinutes,
          transportDistanceMeters: patch.distanceMeters,
          transportDataSource: "google_routes",
        };
      }),
    })),
  };
}
