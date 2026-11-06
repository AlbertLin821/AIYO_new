import { randomUUID } from "node:crypto";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { tripDayDate } from "@/lib/tripDate";
import { reconcileTripMapState } from "@/services/mapSync";
import type { LocationReference, PersistedTripPayload, TripPlanItem } from "@/types";
import type { AgentOperation, AgentProposal } from "./schemas";
import { assessDailyOpeningHours } from "./openingHours";

export type VerifiedAgentPlace = {
  id: string;
  title: string;
  location: LocationReference;
};

export type AgentPreviewResult = {
  trip: PersistedTripPayload;
  changes: Array<{ type: AgentOperation["type"]; itemId: string; before?: TripPlanItem; after?: TripPlanItem }>;
  warnings: string[];
};

function requirePlace(places: ReadonlyMap<string, VerifiedAgentPlace>, id: string): VerifiedAgentPlace {
  const place = places.get(id);
  if (!place || !place.location.verified || !hasUsableMapCoordinate(place.location) || !place.title.trim()) {
    throw new Error("unverified_place");
  }
  return place;
}

function findItem(trip: PersistedTripPayload, id: string) {
  for (const day of trip.itinerary) {
    const index = day.items.findIndex((item) => item.id === id);
    if (index >= 0) return { day, index, item: day.items[index] };
  }
  throw new Error("item_not_found");
}

function targetDay(trip: PersistedTripPayload, dayNumber: number) {
  const day = trip.itinerary.find((candidate) => candidate.dayNumber === dayNumber);
  if (!day) throw new Error("day_not_found");
  return day;
}

function insertAfter(items: TripPlanItem[], item: TripPlanItem, afterItemId: string | null) {
  if (afterItemId === null) {
    items.unshift(item);
    return;
  }
  const index = items.findIndex((candidate) => candidate.id === afterItemId);
  if (index < 0) throw new Error("after_item_not_found");
  items.splice(index + 1, 0, item);
}

function assertTimeAvailable(items: TripPlanItem[], time: string, exceptId?: string) {
  if (items.some((item) => item.id !== exceptId && item.time === time)) throw new Error("schedule_conflict");
}

function minuteOfDay(time: string): number | null {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}

function assertChronologicalOrder(items: TripPlanItem[], changedId: string) {
  const index = items.findIndex((item) => item.id === changedId);
  const changed = minuteOfDay(items[index].time);
  if (changed === null) return;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const previous = minuteOfDay(items[cursor].time);
    if (previous !== null) {
      if (previous >= changed) throw new Error("schedule_conflict");
      break;
    }
  }
  for (let cursor = index + 1; cursor < items.length; cursor += 1) {
    const next = minuteOfDay(items[cursor].time);
    if (next !== null) {
      if (next <= changed) throw new Error("schedule_conflict");
      break;
    }
  }
}

function routeLegs(trip: PersistedTripPayload): Map<string, string> {
  const legs = new Map<string, string>();
  for (const day of trip.itinerary) {
    let previous: TripPlanItem | undefined;
    for (const item of day.items) {
      const currentPoint = item.location && hasUsableMapCoordinate(item.location)
        ? `${item.location.lat},${item.location.lng}` : "";
      const previousPoint = previous?.location && hasUsableMapCoordinate(previous.location)
        ? `${previous.location.lat},${previous.location.lng}` : "";
      legs.set(item.id, `${day.dayNumber}:${previous?.id || ""}:${previousPoint}:${currentPoint}`);
      if (currentPoint) previous = item;
    }
  }
  return legs;
}

function clearChangedRouteEstimates(before: PersistedTripPayload, after: PersistedTripPayload): boolean {
  const originalLegs = routeLegs(before);
  const updatedLegs = routeLegs(after);
  let cleared = false;
  for (const day of after.itinerary) {
    for (const item of day.items) {
      if (originalLegs.get(item.id) === updatedLegs.get(item.id)) continue;
      if (item.transportDurationMinutes !== undefined || item.transportDistanceMeters !== undefined || item.transportDataSource !== undefined) cleared = true;
      delete item.transportDurationMinutes;
      delete item.transportDistanceMeters;
      delete item.transportDataSource;
    }
  }
  return cleared;
}

function checkOpeningHours(place: VerifiedAgentPlace, time: string, date: string | null, warnings: string[]) {
  const assessment = assessDailyOpeningHours(place.location.openingHours, time, date);
  if (assessment === "closed") throw new Error("opening_hours_conflict");
  if (assessment === "closing_soon") warnings.push(`${place.title}距離每日關門時間不足三十分鐘，停留時間待確認。`);
  if (assessment === "unknown") warnings.push(`${place.title}的營業時間待確認。`);
}

export function planAgentPreview(
  current: PersistedTripPayload,
  proposal: AgentProposal,
  verifiedPlaces: ReadonlyMap<string, VerifiedAgentPlace>,
): AgentPreviewResult {
  const trip: PersistedTripPayload = {
    ...current,
    itinerary: current.itinerary.map((day) => ({ ...day, items: day.items.map((item) => ({ ...item })) })),
    pins: current.pins.map((pin) => ({ ...pin })),
  };
  const changes: AgentPreviewResult["changes"] = [];
  const warnings: string[] = [];

  for (const operation of proposal.operations) {
    if (operation.type === "remove_item") {
      const { day, index, item } = findItem(trip, operation.itemId);
      day.items.splice(index, 1);
      changes.push({ type: operation.type, itemId: item.id, before: item });
    } else if (operation.type === "move_item") {
      const { day, index, item } = findItem(trip, operation.itemId);
      const destination = targetDay(trip, operation.toDay);
      if (operation.afterItemId === item.id) throw new Error("after_item_self");
      day.items.splice(index, 1);
      const moved = { ...item, dayNumber: destination.dayNumber, time: operation.time ?? item.time };
      assertTimeAvailable(destination.items, moved.time);
      insertAfter(destination.items, moved, operation.afterItemId);
      assertChronologicalOrder(destination.items, moved.id);
      changes.push({ type: operation.type, itemId: item.id, before: item, after: moved });
    } else if (operation.type === "replace_item") {
      const { day, index, item } = findItem(trip, operation.itemId);
      const place = requirePlace(verifiedPlaces, operation.placeId);
      assertTimeAvailable(day.items, operation.time, item.id);
      const replacement: TripPlanItem = { ...item, title: place.title, time: operation.time, location: place.location, source: "ai" };
      day.items[index] = replacement;
      assertChronologicalOrder(day.items, replacement.id);
      changes.push({ type: operation.type, itemId: item.id, before: item, after: replacement });
      checkOpeningHours(place, operation.time, tripDayDate(trip.startDate, day.dayNumber), warnings);
    } else {
      const destination = targetDay(trip, operation.day);
      const place = requirePlace(verifiedPlaces, operation.placeId);
      assertTimeAvailable(destination.items, operation.time);
      const added: TripPlanItem = {
        id: randomUUID(), dayNumber: destination.dayNumber, time: operation.time,
        title: place.title, type: "activity", source: "ai", location: place.location,
      };
      insertAfter(destination.items, added, operation.afterItemId);
      assertChronologicalOrder(destination.items, added.id);
      changes.push({ type: operation.type, itemId: added.id, after: added });
      checkOpeningHours(place, operation.time, tripDayDate(trip.startDate, destination.dayNumber), warnings);
    }
  }

  if (clearChangedRouteEstimates(current, trip)) warnings.push("路線已變更，原交通時間估算已清除，請重新查詢路程。");
  const reconciled = reconcileTripMapState(trip.itinerary, trip.pins);
  return { trip: { ...trip, itinerary: reconciled.itinerary, pins: reconciled.pins }, changes, warnings };
}
