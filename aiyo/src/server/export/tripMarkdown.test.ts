import assert from "node:assert/strict";
import test from "node:test";
import { buildTripMarkdown } from "@/server/export/tripMarkdown";
import type { PersistedTripPayload } from "@/types";

test("buildTripMarkdown includes title days items and pins", () => {
  const trip: PersistedTripPayload = {
    tripId: "t1",
    title: "台南三日",
    destination: "台南",
    days: 2,
    budget: 10000,
    itinerary: [
      {
        dayNumber: 1,
        theme: "古城",
        items: [
          {
            id: "i1",
            time: "09:00",
            title: "孔廟",
            type: "activity",
            notes: "走走",
          },
        ],
      },
      {
        dayNumber: 2,
        theme: "海線",
        items: [],
      },
    ],
    pins: [
      {
        id: "p1",
        name: "孔廟",
        lat: 22.99,
        lng: 120.2,
        description: "文化園區",
      },
    ],
    updatedAt: "2026-05-17",
  };
  const md = buildTripMarkdown(trip);
  assert.match(md, /# 台南三日/);
  assert.match(md, /第 1 天/);
  assert.match(md, /孔廟/);
  assert.match(md, /## 地圖標記/);
  assert.match(md, /22\.99000/);
});
