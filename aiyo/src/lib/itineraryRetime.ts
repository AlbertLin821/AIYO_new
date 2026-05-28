import type { TripPlanItem } from "@/types";

const DEFAULT_STOP_MINUTES = 90;

function toMinutes(time: string | undefined): number {
  if (!time) {
    return 9 * 60;
  }
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return 9 * 60;
  }
  return Math.min(23 * 60 + 59, Number(match[1]) * 60 + Number(match[2]));
}

function toClock(totalMinutes: number): string {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, totalMinutes));
  const hour = Math.floor(bounded / 60);
  const minute = bounded % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function retimeDayItems(items: TripPlanItem[]): TripPlanItem[] {
  if (items.length <= 1) {
    return items;
  }
  let cursor = toMinutes(items[0]?.time);
  return items.map((item, index) => {
    if (index === 0) {
      cursor = toMinutes(item.time);
      return item;
    }
    const travelMinutes =
      typeof item.transportDurationMinutes === "number" && item.transportDurationMinutes > 0
        ? Math.round(item.transportDurationMinutes)
        : 30;
    cursor += travelMinutes;
    const next = {
      ...item,
      time: toClock(cursor),
    };
    cursor += DEFAULT_STOP_MINUTES;
    return next;
  });
}
