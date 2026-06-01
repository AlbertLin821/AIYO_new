import test from "node:test";
import assert from "node:assert/strict";
import { buildPinStopOrderByPinId, findLinkedPinForItem } from "@/lib/mapPinItineraryLink";
import type { MapPin, TripPlanDay, TripPlanItem } from "@/types";

test("findLinkedPinForItem matches linkedTripItemId", () => {
  const item: TripPlanItem = {
    id: "i1",
    title: "Test",
    type: "attraction",
    time: "10:00",
  };
  const pins: MapPin[] = [
    { id: "p1", name: "X", lat: 1, lng: 2, description: "", linkedTripItemId: "i1" },
  ];
  assert.equal(findLinkedPinForItem(item, pins)?.id, "p1");
});

test("buildPinStopOrderByPinId numbers pins in itinerary order", () => {
  const items1: TripPlanItem[] = [
    { id: "a", title: "A", type: "attraction", time: "09:00" },
    { id: "b", title: "B", type: "restaurant", time: "12:00" },
  ];
  const day1: TripPlanDay = { dayNumber: 1, items: items1 };
  const items2: TripPlanItem[] = [{ id: "c", title: "C", type: "attraction", time: "10:00" }];
  const day2: TripPlanDay = { dayNumber: 2, items: items2 };
  const pins: MapPin[] = [
    { id: "pA", name: "PA", lat: 0, lng: 0, description: "", linkedTripItemId: "a" },
    { id: "pB", name: "PB", lat: 1, lng: 1, description: "", linkedTripItemId: "b" },
    { id: "pC", name: "PC", lat: 2, lng: 2, description: "", linkedTripItemId: "c" },
  ];
  const order = buildPinStopOrderByPinId([day1, day2], pins);
  assert.equal(order.get("pA"), 1);
  assert.equal(order.get("pB"), 2);
  assert.equal(order.get("pC"), 3);
});

test("buildPinStopOrderByPinId assigns one number when two items resolve to the same pin", () => {
  const items: TripPlanItem[] = [
    {
      id: "a",
      title: "Foo",
      type: "attraction",
      time: "09:00",
      location: { name: "Foo", lat: 25.04, lng: 121.56, description: "" },
    },
    {
      id: "b",
      title: "Foo PM",
      type: "attraction",
      time: "14:00",
      location: { name: "Foo", lat: 25.04, lng: 121.56, description: "" },
    },
  ];
  const day: TripPlanDay = { dayNumber: 1, items };
  const pins: MapPin[] = [{ id: "p1", name: "Foo", lat: 25.04, lng: 121.56, description: "" }];
  const order = buildPinStopOrderByPinId([day], pins);
  assert.equal(order.get("p1"), 1);
  assert.equal(order.size, 1);
});
