import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPinsFromLocations,
  buildPinsFromTripPlan,
  mergeTripItineraryPins,
  reconcileTripMapState,
} from "@/services/mapSync";
import type { LocationReference, TripPlanDay } from "@/types";

const locationWithDetails: LocationReference = {
  name: "林聰明砂鍋魚頭",
  lat: 23.4773,
  lng: 120.4496,
  description: "嘉義知名砂鍋魚頭店",
  address: "嘉義市東區中正路361號",
  placeId: "mock-place-id",
  thumbnail: "https://example.com/thumb.jpg",
  openingHours: "10:00-21:00",
  phoneNumber: "05-227-0661",
  verified: true,
  confidence: 0.91,
};

test("buildPinsFromLocations preserves map info-window fields and removes duplicates", () => {
  const pins = buildPinsFromLocations([locationWithDetails, { ...locationWithDetails }], "video");
  assert.equal(pins.length, 1);
  assert.equal(pins[0].name, locationWithDetails.name);
  assert.equal(pins[0].address, locationWithDetails.address);
  assert.equal(pins[0].placeId, locationWithDetails.placeId);
  assert.equal(pins[0].thumbnail, locationWithDetails.thumbnail);
  assert.equal(pins[0].openingHours, locationWithDetails.openingHours);
  assert.equal(pins[0].phoneNumber, locationWithDetails.phoneNumber);
  assert.equal(pins[0].source, "video");
});

test("buildPinsFromTripPlan links pins back to itinerary items", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "item-1",
          dayNumber: 1,
          time: "12:00",
          title: "午餐",
          type: "restaurant",
          notes: "砂鍋魚頭",
          location: locationWithDetails,
        },
      ],
    },
  ];

  const pins = buildPinsFromTripPlan(days);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].id, "day_1_item-1");
  assert.equal(pins[0].linkedTripItemId, "item-1");
  assert.equal(pins[0].dayNumber, 1);
  assert.equal(pins[0].source, "itinerary");
});

test("buildPinsFromTripPlan skips null-island placeholder coordinates", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "bad-location",
          time: "09:00",
          title: "錯誤標點",
          type: "activity",
          location: {
            name: "錯誤標點",
            lat: 0,
            lng: 0,
            description: "placeholder",
          },
        },
        {
          id: "good-location",
          time: "10:00",
          title: "正確標點",
          type: "activity",
          location: locationWithDetails,
        },
      ],
    },
  ];

  const pins = buildPinsFromTripPlan(days);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].id, "day_1_good-location");
});

test("buildPinsFromTripPlan includes manually added geocoded activities", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 2,
      items: [
        {
          id: "manual-activity",
          dayNumber: 2,
          time: "16:00",
          title: "手動新增景點",
          type: "activity",
          notes: "從地圖面板新增",
          location: locationWithDetails,
          source: "manual",
        },
      ],
    },
  ];

  const pins = buildPinsFromTripPlan(days);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].id, "day_2_manual-activity");
  assert.equal(pins[0].linkedTripItemId, "manual-activity");
  assert.equal(pins[0].source, "itinerary");
});

test("mergeTripItineraryPins keeps non-itinerary pins while rebuilding itinerary pins", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "item-1",
          time: "12:00",
          title: "午餐",
          type: "restaurant",
          location: locationWithDetails,
        },
      ],
    },
  ];

  const merged = mergeTripItineraryPins(
    [
      {
        id: "video-pin",
        name: "文化路夜市",
        lat: 23.479,
        lng: 120.449,
        description: "影片擷取",
        source: "video",
      },
      {
        id: "stale-itinerary-pin",
        name: "舊行程",
        lat: 0,
        lng: 0,
        description: "應被重建移除",
        source: "itinerary",
      },
    ],
    days,
  );

  assert.ok(merged.some((pin) => pin.id === "video-pin"));
  assert.ok(!merged.some((pin) => pin.id === "stale-itinerary-pin"));
  assert.ok(merged.some((pin) => pin.id === "day_1_item-1"));
});

test("reconcileTripMapState backfills item location from existing pin", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "item-1",
          time: "10:00",
          title: "孔廟",
          type: "attraction",
        },
      ],
    },
  ];
  const pins = [
    {
      id: "pin-1",
      name: "孔廟",
      lat: 22.9908,
      lng: 120.2026,
      description: "台南孔廟",
      linkedTripItemId: "item-1",
      dayNumber: 1,
      source: "itinerary" as const,
    },
  ];

  const reconciled = reconcileTripMapState(days, pins);
  assert.ok(reconciled.itinerary[0]?.items[0]?.location);
  assert.equal(reconciled.itinerary[0]?.items[0]?.location?.lat, 22.9908);
  assert.equal(reconciled.pins[0]?.linkedTripItemId, "item-1");
});

test("reconcileTripMapState creates pins for items that already have coordinates", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "item-2",
          time: "12:00",
          title: "午餐",
          type: "restaurant",
          location: locationWithDetails,
        },
      ],
    },
  ];

  const reconciled = reconcileTripMapState(days, []);
  assert.equal(reconciled.pins.length, 1);
  assert.equal(reconciled.pins[0]?.id, "day_1_item-2");
  assert.equal(reconciled.pins[0]?.linkedTripItemId, "item-2");
});

test("buildPinsFromTripPlan skips anchored synthetic meal stops", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 7,
      items: [
        {
          id: "attraction-1",
          time: "09:00",
          title: "湧湧座",
          type: "attraction",
          location: locationWithDetails,
        },
        {
          id: "meal-1",
          time: "12:00",
          title: "湧湧座 附近午餐",
          type: "restaurant",
          location: locationWithDetails,
        },
      ],
    },
  ];

  const pins = buildPinsFromTripPlan(days);
  assert.equal(pins.length, 1);
  assert.equal(pins[0].linkedTripItemId, "attraction-1");
});

