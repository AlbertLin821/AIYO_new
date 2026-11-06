import assert from "node:assert/strict";
import test from "node:test";
import { checkItineraryReorder } from "@/lib/itineraryReorderAdvice";
import type { TripPlanDay, TripPlanItem } from "@/types";

function item(id: string, time: string, lat: number, openingHours?: string): TripPlanItem {
  return {
    id, title: id, time, type: "attraction", transport: "步行", transportDurationMinutes: 10,
    location: { name: id, lat, lng: 121.5, description: "", openingHours },
  };
}

test("reorder advice flags road travel and closed opening hours without changing the itinerary", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: true, data: { route: { durationSeconds: 2400 } } });
  try {
    const days: TripPlanDay[] = [{ dayNumber: 1, items: [item("甲", "09:00", 25), item("乙", "09:30", 25.01, "Mo-Su 10:00-18:00")] }];
    const before = structuredClone(days);
    const advice = await checkItineraryReorder(days, [1], "2026-11-06");
    assert.equal(advice.checkedRoutes, 1);
    assert.ok(advice.messages.some((message) => message.includes("營業時間之外")));
    assert.ok(advice.messages.some((message) => message.includes("道路路程約 40 分鐘")));
    assert.deepEqual(days, before);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reorder advice marks route gaps when provider fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ success: false }, { status: 503 });
  try {
    const days: TripPlanDay[] = [{ dayNumber: 2, items: [item("甲", "09:00", 25), item("乙", "10:30", 25.01)] }];
    const advice = await checkItineraryReorder(days, [2], null);
    assert.equal(advice.checkedRoutes, 0);
    assert.equal(advice.uncheckedRoutes, 1);
    assert.ok(advice.messages.some((message) => message.includes("尚無可核對")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
