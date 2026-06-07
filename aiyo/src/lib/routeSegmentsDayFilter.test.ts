import assert from "node:assert/strict";
import test from "node:test";

import { buildItineraryRouteSegments, filterRouteSegmentsByDayNumbers } from "@/lib/routeSegments";
import type { TripPlanDay } from "@/types";

const loc = (name: string, lat: number, lng: number) => ({
  name,
  lat,
  lng,
  description: "",
});

function sampleDays(): TripPlanDay[] {
  return [
    {
      dayNumber: 1,
      items: [
        { id: "a", dayNumber: 1, time: "09:00", title: "A", type: "attraction", notes: "", source: "manual", location: loc("A", 25.04, 121.56) },
        { id: "b", dayNumber: 1, time: "10:00", title: "B", type: "restaurant", notes: "", source: "manual", location: loc("B", 25.05, 121.57) },
      ],
    },
    {
      dayNumber: 2,
      items: [
        { id: "c", dayNumber: 2, time: "09:00", title: "C", type: "attraction", notes: "", source: "manual", location: loc("C", 25.06, 121.58) },
        { id: "d", dayNumber: 2, time: "10:00", title: "D", type: "restaurant", notes: "", source: "manual", location: loc("D", 25.07, 121.59) },
      ],
    },
    {
      dayNumber: 3,
      items: [
        { id: "e", dayNumber: 3, time: "09:00", title: "E", type: "attraction", notes: "", source: "manual", location: loc("E", 25.08, 121.6) },
        { id: "f", dayNumber: 3, time: "10:00", title: "F", type: "restaurant", notes: "", source: "manual", location: loc("F", 25.09, 121.61) },
      ],
    },
  ];
}

test("filterRouteSegmentsByDayNumbers returns all segments when the visible-day selection is empty", () => {
  const segments = buildItineraryRouteSegments(sampleDays());

  assert.equal(filterRouteSegmentsByDayNumbers(segments, []).length, segments.length);
});

test("filterRouteSegmentsByDayNumbers keeps only the selected day's segments", () => {
  const segments = buildItineraryRouteSegments(sampleDays());
  const day2Segments = filterRouteSegmentsByDayNumbers(segments, [2]);

  assert.equal(day2Segments.length, 1);
  assert.equal(day2Segments[0]?.dayNumber, 2);
});

test("filterRouteSegmentsByDayNumbers switches to a different day when the selection changes", () => {
  const segments = buildItineraryRouteSegments(sampleDays());
  const day2Segments = filterRouteSegmentsByDayNumbers(segments, [2]);
  const day3Segments = filterRouteSegmentsByDayNumbers(segments, [3]);

  assert.equal(day2Segments.length, 1);
  assert.equal(day3Segments.length, 1);
  assert.equal(day2Segments[0]?.dayNumber, 2);
  assert.equal(day3Segments[0]?.dayNumber, 3);
  assert.notEqual(day2Segments[0]?.id, day3Segments[0]?.id);
});
