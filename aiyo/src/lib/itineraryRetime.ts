import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import { estimateDistanceKm, estimateTravelMinutes } from "@/lib/routeSegments";
import type { TripPlanItem } from "@/types";

export const DEFAULT_STOP_MINUTES = 90;
const MIN_DWELL_MINUTES = 15;
const MAX_DWELL_MINUTES = 180;
const DEFAULT_TRAVEL_MINUTES = 30;
const DAY_END_MINUTES = 23 * 60 + 59;

export type RetimeDayItemsOptions = {
  /** Minutes from midnight for the first stop; defaults to the first item's current time. */
  dayStartMinutes?: number;
  /** Pre-reorder items used to derive per-stop dwell minutes. */
  previousItems?: TripPlanItem[];
};

export function toMinutes(time: string | undefined): number {
  if (!time) {
    return 9 * 60;
  }
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return 9 * 60;
  }
  return Math.min(DAY_END_MINUTES, Number(match[1]) * 60 + Number(match[2]));
}

export function toClock(totalMinutes: number): string {
  const bounded = Math.max(0, Math.min(DAY_END_MINUTES, totalMinutes));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function itemCoordinates(item: TripPlanItem): { lat: number; lng: number } | null {
  if (!item.location || !isUsableMapCoordinate(item.location.lat, item.location.lng)) {
    return null;
  }
  return { lat: item.location.lat, lng: item.location.lng };
}

function travelMinutesBetween(from: TripPlanItem, to: TripPlanItem): number {
  const fromCoord = itemCoordinates(from);
  const toCoord = itemCoordinates(to);
  if (!fromCoord || !toCoord) {
    return DEFAULT_TRAVEL_MINUTES;
  }
  const transport = to.transport?.trim() || "Transit";
  const distanceKm = estimateDistanceKm(fromCoord, toCoord);
  return estimateTravelMinutes(distanceKm, transport);
}

function travelMinutesFromPreviousOrder(previousItems: TripPlanItem[], item: TripPlanItem): number {
  const index = previousItems.findIndex((candidate) => candidate.id === item.id);
  if (index <= 0) {
    return DEFAULT_TRAVEL_MINUTES;
  }
  const previous = previousItems[index - 1]!;
  return travelMinutesBetween(previous, item);
}

function buildDwellMinutesById(previousItems: TripPlanItem[]): Map<string, number> {
  const dwellById = new Map<string, number>();
  for (let index = 1; index < previousItems.length; index += 1) {
    const previous = previousItems[index - 1]!;
    const current = previousItems[index]!;
    const arrivalPrevious = toMinutes(previous.time);
    const arrivalCurrent = toMinutes(current.time);
    const travel = travelMinutesFromPreviousOrder(previousItems, current);
    const dwell = arrivalCurrent - arrivalPrevious - travel;
    const clamped = Math.max(
      MIN_DWELL_MINUTES,
      Math.min(
        MAX_DWELL_MINUTES,
        Number.isFinite(dwell) ? dwell : DEFAULT_STOP_MINUTES,
      ),
    );
    dwellById.set(previous.id, clamped);
  }
  return dwellById;
}

function resolveDayStartMinutes(items: TripPlanItem[], options?: RetimeDayItemsOptions): number {
  if (typeof options?.dayStartMinutes === "number" && Number.isFinite(options.dayStartMinutes)) {
    return Math.max(0, Math.min(DAY_END_MINUTES, Math.round(options.dayStartMinutes)));
  }
  return toMinutes(items[0]?.time);
}

export function retimeDayItems(items: TripPlanItem[], options?: RetimeDayItemsOptions): TripPlanItem[] {
  if (items.length === 0) {
    return items;
  }

  const dayStart = resolveDayStartMinutes(items, options);
  if (items.length === 1) {
    return [
      {
        ...items[0]!,
        time: toClock(dayStart),
        transportDurationMinutes: undefined,
        transportDistanceMeters: undefined,
        transportDataSource: undefined,
      },
    ];
  }

  const previousItems = options?.previousItems ?? items;
  const dwellById = buildDwellMinutesById(previousItems);
  let cursor = dayStart;

  return items.map((item, index) => {
    if (index === 0) {
      return {
        ...item,
        time: toClock(cursor),
        transportDurationMinutes: undefined,
        transportDistanceMeters: undefined,
        transportDataSource: undefined,
      };
    }

    const previous = items[index - 1]!;
    const dwellMinutes = dwellById.get(previous.id) ?? DEFAULT_STOP_MINUTES;
    const travelMinutes = travelMinutesBetween(previous, item);
    cursor += dwellMinutes + travelMinutes;

    const fromCoord = itemCoordinates(previous);
    const toCoord = itemCoordinates(item);
    const distanceMeters =
      fromCoord && toCoord ? Math.round(estimateDistanceKm(fromCoord, toCoord) * 1000) : undefined;

    return {
      ...item,
      time: toClock(cursor),
      transportDurationMinutes: travelMinutes,
      transportDistanceMeters: distanceMeters,
      transportDataSource: undefined,
    };
  });
}

/** Reorder by id list and retime using the pre-reorder day anchor and dwell map. */
export function reorderItemsWithRetime(
  items: TripPlanItem[],
  orderedItemIds: string[],
): TripPlanItem[] {
  const originalIndex = new Map(items.map((item, index) => [item.id, index]));
  const order = new Map(orderedItemIds.map((id, index) => [id, index]));
  const reordered = [...items].sort((left, right) => {
    const leftOrder = order.has(left.id)
      ? order.get(left.id)!
      : (originalIndex.get(left.id) ?? Number.MAX_SAFE_INTEGER) + order.size;
    const rightOrder = order.has(right.id)
      ? order.get(right.id)!
      : (originalIndex.get(right.id) ?? Number.MAX_SAFE_INTEGER) + order.size;
    return leftOrder - rightOrder;
  });
  return retimeDayItems(reordered, {
    dayStartMinutes: toMinutes(items[0]?.time),
    previousItems: items,
  });
}
