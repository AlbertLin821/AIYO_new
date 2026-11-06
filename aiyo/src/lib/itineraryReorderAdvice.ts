import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import { toMinutes } from "@/lib/itineraryRetime";
import { tripDayDate } from "@/lib/tripDate";
import { assessDailyOpeningHours } from "@/server/agent/openingHours";
import type { TripPlanDay, TripPlanItem } from "@/types";

export type ReorderAdvice = {
  days: number[];
  messages: string[];
  checkedRoutes: number;
  uncheckedRoutes: number;
};

type RouteResponse = {
  success?: boolean;
  data?: { route?: { durationSeconds?: number } };
};

function routeProfile(transport: string | undefined): "walking" | "cycling" | "driving" | null {
  const value = transport?.toLowerCase() ?? "";
  if (/步行|走路|walking|walk/.test(value)) return "walking";
  if (/自行車|單車|cycling|bike/.test(value)) return "cycling";
  if (/開車|自駕|計程車|出租車|汽車|driving|drive|taxi|car/.test(value)) return "driving";
  return null;
}

function hasCoordinates(item: TripPlanItem): boolean {
  return Boolean(item.location && isUsableMapCoordinate(item.location.lat, item.location.lng));
}

export async function checkItineraryReorder(
  itinerary: TripPlanDay[],
  dayNumbers: number[],
  startDate: string | null | undefined,
  signal?: AbortSignal,
): Promise<ReorderAdvice> {
  const days = [...new Set(dayNumbers)].sort((a, b) => a - b);
  const messages: string[] = [];
  let checkedRoutes = 0;
  let uncheckedRoutes = 0;

  for (const dayNumber of days) {
    const day = itinerary.find((entry) => entry.dayNumber === dayNumber);
    if (!day) continue;
    const date = tripDayDate(startDate, dayNumber);
    for (const item of day.items) {
      const hours = assessDailyOpeningHours(item.location?.openingHours, item.time, date);
      if (hours === "closed") messages.push(`第 ${dayNumber} 天「${item.title}」排在已記錄營業時間之外，請核對時段。`);
      if (hours === "closing_soon") messages.push(`第 ${dayNumber} 天「${item.title}」接近已記錄的關門時間，請核對停留時間。`);
    }

    for (let index = 1; index < day.items.length; index += 1) {
      const from = day.items[index - 1]!;
      const to = day.items[index]!;
      const profile = routeProfile(to.transport);
      if (!hasCoordinates(from) || !hasCoordinates(to) || !profile || checkedRoutes + uncheckedRoutes >= 8) {
        uncheckedRoutes += 1;
        continue;
      }
      try {
        const response = await fetch("/api/maps/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ points: [from.location, to.location].map((point) => ({ lat: point!.lat, lng: point!.lng })), profile }),
          signal,
        });
        const body = await response.json() as RouteResponse;
        const seconds = body.data?.route?.durationSeconds;
        if (!response.ok || !body.success || !Number.isFinite(seconds)) throw new Error("route unavailable");
        checkedRoutes += 1;
        const routeMinutes = Math.ceil(seconds! / 60);
        const scheduledTravel = to.transportDurationMinutes ?? 0;
        const interval = toMinutes(to.time) - toMinutes(from.time);
        if (routeMinutes > scheduledTravel + 15 || routeMinutes >= interval) {
          messages.push(`第 ${dayNumber} 天「${from.title}」到「${to.title}」道路路程約 ${routeMinutes} 分鐘，請核對目前的抵達時間。`);
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        uncheckedRoutes += 1;
      }
    }
  }

  if (uncheckedRoutes > 0) messages.push(`${uncheckedRoutes} 段交通尚無可核對的道路路程，請以地圖或官方時刻表確認。`);
  return { days, messages: messages.slice(0, 5), checkedRoutes, uncheckedRoutes };
}
