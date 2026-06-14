import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findItineraryItemDayNumber,
  itineraryDayContainerId,
  parseItineraryDayContainerId,
  resolveItineraryDragTarget,
} from "./itineraryDragUtils";
import type { TripPlanDay } from "@/types";

const sampleItinerary: TripPlanDay[] = [
  {
    dayNumber: 1,
    items: [{ id: "a", time: "09:00", title: "A", type: "attraction" }],
  },
  {
    dayNumber: 2,
    items: [
      { id: "b", time: "10:00", title: "B", type: "attraction" },
      { id: "c", time: "12:00", title: "C", type: "restaurant" },
    ],
  },
];

describe("itineraryDragUtils", () => {
  it("maps container ids to day numbers", () => {
    assert.equal(itineraryDayContainerId(2), "day-container-2");
    assert.equal(parseItineraryDayContainerId("day-container-2"), 2);
    assert.equal(parseItineraryDayContainerId("item-1"), null);
  });

  it("finds the day that owns an item", () => {
    assert.equal(findItineraryItemDayNumber(sampleItinerary, "c"), 2);
    assert.equal(findItineraryItemDayNumber(sampleItinerary, "missing"), null);
  });

  it("resolves drop targets for items and empty day containers", () => {
    assert.deepEqual(resolveItineraryDragTarget(sampleItinerary, "b"), { dayNumber: 2, index: 0 });
    assert.deepEqual(resolveItineraryDragTarget(sampleItinerary, itineraryDayContainerId(1)), {
      dayNumber: 1,
      index: 1,
    });
    assert.deepEqual(resolveItineraryDragTarget(sampleItinerary, itineraryDayContainerId(99)), {
      dayNumber: 99,
      index: 0,
    });
  });
});
