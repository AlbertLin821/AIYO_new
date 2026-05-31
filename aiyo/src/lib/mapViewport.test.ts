import assert from "node:assert/strict";
import test from "node:test";

import {
  collectMapViewportPoints,
  pinsGeometryKey,
  shouldUseTaiwanDefaultViewport,
} from "@/lib/mapViewport";
import type { MapPin, TripPlanDay } from "@/types";

const sampleItinerary: TripPlanDay[] = [
  {
    dayNumber: 1,
    theme: "",
    summary: "",
    items: [
      {
        id: "item-1",
        dayNumber: 1,
        time: "10:00",
        title: "Kyoto Tower",
        type: "sightseeing",
        transport: "",
        transportDurationMinutes: 0,
        transportDistanceMeters: 0,
        transportDataSource: "",
        notes: "",
        source: "manual",
        location: {
          name: "Kyoto Tower",
          lat: 34.9875,
          lng: 135.759,
          description: "",
        },
      },
    ],
  },
];

test("collectMapViewportPoints prefers pins then falls back to itinerary coordinates", () => {
  const fromItinerary = collectMapViewportPoints([], sampleItinerary);
  assert.equal(fromItinerary.length, 1);
  assert.equal(fromItinerary[0]?.lat, 34.9875);

  const pin: MapPin = {
    id: "pin-1",
    name: "Osaka",
    lat: 34.6937,
    lng: 135.5023,
    description: "",
    color: "#000",
    source: "manual",
  };
  const fromPins = collectMapViewportPoints([pin], sampleItinerary);
  assert.equal(fromPins.length, 1);
  assert.equal(fromPins[0]?.lat, 34.6937);
});

test("pinsGeometryKey is stable when only pin order changes", () => {
  const pinA: MapPin = {
    id: "pin-a",
    name: "A",
    lat: 25.033,
    lng: 121.565,
    description: "",
    color: "#000",
    source: "manual",
  };
  const pinB: MapPin = {
    id: "pin-b",
    name: "B",
    lat: 25.047,
    lng: 121.517,
    description: "",
    color: "#000",
    source: "manual",
  };
  assert.equal(pinsGeometryKey([pinA, pinB]), pinsGeometryKey([pinB, pinA]));
  assert.notEqual(
    pinsGeometryKey([pinA, pinB]),
    pinsGeometryKey([{ ...pinB, lat: pinB.lat + 0.001 }]),
  );
});

test("shouldUseTaiwanDefaultViewport is false when trip context exists without coordinates yet", () => {
  assert.equal(
    shouldUseTaiwanDefaultViewport({
      tripId: "trip-abc",
      destination: "",
      points: [],
      focusLocation: null,
    }),
    false,
  );
  assert.equal(
    shouldUseTaiwanDefaultViewport({
      tripId: "",
      destination: "東京",
      points: [],
      focusLocation: null,
    }),
    false,
  );
  assert.equal(
    shouldUseTaiwanDefaultViewport({
      tripId: "",
      destination: "",
      points: [],
      focusLocation: null,
    }),
    true,
  );
});
