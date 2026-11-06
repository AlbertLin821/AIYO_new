import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { mapRouteProfile } from "@/lib/mapRoutePresentation";
import { mapService } from "@/server/maps/service";
import type { GeoPoint, MapRoute, RouteProfile } from "@/server/maps/types";
import type { PersistedTripPayload, TripPlanItem } from "@/types";
import type { AgentPreviewResult } from "./previewPlanner";

type RouteLookup = (points: GeoPoint[], profile: RouteProfile) => Promise<MapRoute>;

function minutes(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function point(item: TripPlanItem): GeoPoint | null {
  return item.location && hasUsableMapCoordinate(item.location)
    ? { lat: item.location.lat, lng: item.location.lng }
    : null;
}

function legKey(dayNumber: number, from: TripPlanItem, to: TripPlanItem): string {
  const a = point(from)!;
  const b = point(to)!;
  return `${dayNumber}:${from.id}:${to.id}:${a.lat},${a.lng}:${b.lat},${b.lng}`;
}

function knownLegs(trip: PersistedTripPayload): Map<string, string> {
  const keys = new Map<string, string>();
  for (const day of trip.itinerary) {
    let previous: TripPlanItem | undefined;
    for (const item of day.items) {
      if (!point(item)) continue;
      if (previous) keys.set(item.id, legKey(day.dayNumber, previous, item));
      previous = item;
    }
  }
  return keys;
}

export async function validatePreviewTravel(
  before: PersistedTripPayload,
  preview: AgentPreviewResult,
  getRoute: RouteLookup = (points, profile) => mapService.getRoute(points, profile),
): Promise<AgentPreviewResult> {
  const originalLegs = knownLegs(before);
  const originalTimes = new Map(before.itinerary.flatMap((day) => day.items.map((item) => [item.id, item.time] as const)));
  const warnings = [...preview.warnings];
  const requests: Array<{ from: TripPlanItem; to: TripPlanItem; dayNumber: number; profile: RouteProfile }> = [];

  for (const day of preview.trip.itinerary) {
    let previous: TripPlanItem | undefined;
    for (const item of day.items) {
      if (!point(item)) continue;
      if (previous) {
        const profile = mapRouteProfile(item.transport || "");
        const changed = originalLegs.get(item.id) !== legKey(day.dayNumber, previous, item);
        if (changed && profile) requests.push({ from: previous, to: item, dayNumber: day.dayNumber, profile });
        if (changed && !profile) warnings.push("部分變更路段的交通方式或路程待確認。");
        if (!changed && (originalTimes.get(item.id) !== item.time || originalTimes.get(previous.id) !== previous.time) && typeof item.transportDurationMinutes === "number") {
          const gap = minutes(item.time) !== null && minutes(previous.time) !== null
            ? minutes(item.time)! - minutes(previous.time)! : null;
          if (gap !== null && gap < item.transportDurationMinutes) throw new Error("travel_time_conflict");
        }
      }
      previous = item;
    }
  }

  if (requests.length > 8) warnings.push("變更路段超過八段，部分交通時間待確認。");
  const results = await Promise.allSettled(requests.slice(0, 8).map(async (request) => ({
    request,
    route: await getRoute([point(request.from)!, point(request.to)!], request.profile),
  })));
  for (const result of results) {
    if (result.status === "rejected") {
      warnings.push("部分變更路段的交通時間待確認。");
      continue;
    }
    const { request, route } = result.value;
    if (!Number.isFinite(route.durationSeconds) || route.durationSeconds <= 0) {
      warnings.push("部分變更路段的交通時間待確認。");
      continue;
    }
    const travelMinutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
    const fromTime = minutes(request.from.time);
    const toTime = minutes(request.to.time);
    if (fromTime !== null && toTime !== null && toTime - fromTime < travelMinutes) throw new Error("travel_time_conflict");
    if (fromTime !== null && toTime !== null && toTime - fromTime < travelMinutes + 10) {
      warnings.push(`${request.from.title}到${request.to.title}的交通緩衝不足十分鐘。`);
    }
    request.to.transportDurationMinutes = travelMinutes;
    request.to.transportDistanceMeters = Math.round(route.distanceMeters);
    request.to.transportDataSource = "osrm";
    const change = preview.changes.find((candidate) => candidate.itemId === request.to.id && candidate.after);
    if (change?.after) {
      change.after.transportDurationMinutes = travelMinutes;
      change.after.transportDistanceMeters = Math.round(route.distanceMeters);
      change.after.transportDataSource = "osrm";
    }
  }
  return { ...preview, warnings: [...new Set(warnings)] };
}
