import { describe, expect, it } from "vitest";
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
    expect(itineraryDayContainerId(2)).toBe("day-container-2");
    expect(parseItineraryDayContainerId("day-container-2")).toBe(2);
    expect(parseItineraryDayContainerId("item-1")).toBeNull();
  });

  it("finds the day that owns an item", () => {
    expect(findItineraryItemDayNumber(sampleItinerary, "c")).toBe(2);
    expect(findItineraryItemDayNumber(sampleItinerary, "missing")).toBeNull();
  });

  it("resolves drop targets for items and empty day containers", () => {
    expect(resolveItineraryDragTarget(sampleItinerary, "b")).toEqual({ dayNumber: 2, index: 0 });
    expect(resolveItineraryDragTarget(sampleItinerary, itineraryDayContainerId(1))).toEqual({
      dayNumber: 1,
      index: 1,
    });
    expect(resolveItineraryDragTarget(sampleItinerary, itineraryDayContainerId(99))).toEqual({
      dayNumber: 99,
      index: 0,
    });
  });
});
