import assert from "node:assert/strict";
import test from "node:test";
import { buildItineraryRouteSegments } from "@/lib/routeSegments";
import type { TripPlanDay } from "@/types";

const loc = (name: string, lat: number, lng: number) => ({
  name,
  lat,
  lng,
  description: "",
});

test("same-day consecutive legs use alternating stroke colors", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "a",
          dayNumber: 1,
          time: "09:00",
          title: "A",
          type: "attraction",
          notes: "",
          source: "manual",
          location: loc("A", 25.04, 121.56),
        },
        {
          id: "b",
          dayNumber: 1,
          time: "10:00",
          title: "B",
          type: "restaurant",
          notes: "",
          source: "manual",
          location: loc("B", 25.05, 121.57),
        },
        {
          id: "c",
          dayNumber: 1,
          time: "11:00",
          title: "C",
          type: "activity",
          notes: "",
          source: "manual",
          location: loc("C", 25.06, 121.58),
        },
      ],
    },
  ];
  const segments = buildItineraryRouteSegments(days);
  assert.equal(segments.length, 2);
  assert.notEqual(segments[0]!.color, segments[1]!.color);
});
