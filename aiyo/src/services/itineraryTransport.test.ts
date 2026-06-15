import assert from "node:assert/strict";
import test from "node:test";
import { hydrateItineraryTransportFields } from "@/services/itineraryTransport";
import type { TripPlanDay, TripPlanItem } from "@/types";

function createItem(input: Partial<TripPlanItem> & Pick<TripPlanItem, "id" | "title" | "time">): TripPlanItem {
  return {
    type: "attraction",
    source: "ai",
    ...input,
  };
}

test("hydrateItineraryTransportFields fills missing modes and estimates for island trips", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        createItem({
          id: "a",
          title: "篤行十村",
          time: "09:00",
          location: { name: "篤行十村", lat: 23.5638542, lng: 119.5609494, description: "篤行十村" },
        }),
        createItem({
          id: "b",
          title: "富園小吃",
          time: "12:00",
          location: { name: "富園小吃", lat: 23.5660061, lng: 119.5683694, description: "富園小吃" },
        }),
      ],
    },
  ];

  const hydrated = hydrateItineraryTransportFields(days, {
    destination: "澎湖",
    preferredTransport: null,
  });

  assert.equal(hydrated[0]?.items[1]?.transport, "Driving");
  assert.equal(typeof hydrated[0]?.items[1]?.transportDurationMinutes, "number");
  assert.equal(typeof hydrated[0]?.items[1]?.transportDistanceMeters, "number");
});

test("hydrateItineraryTransportFields respects explicit transport preference", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        createItem({
          id: "a",
          title: "淺草寺",
          time: "09:00",
          location: { name: "淺草寺", lat: 35.7148, lng: 139.7967, description: "淺草寺" },
        }),
        createItem({
          id: "b",
          title: "東京晴空塔",
          time: "10:30",
          location: { name: "東京晴空塔", lat: 35.7101, lng: 139.8107, description: "東京晴空塔" },
        }),
      ],
    },
  ];

  const hydrated = hydrateItineraryTransportFields(days, {
    destination: "東京",
    preferredTransport: "public_transport",
  });

  assert.equal(hydrated[0]?.items[1]?.transport, "Transit (Metro)");
});

test("hydrateItineraryTransportFields keeps fully populated transport fields", () => {
  const days: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        createItem({
          id: "a",
          title: "A",
          time: "09:00",
          location: { name: "A", lat: 25.0, lng: 121.5, description: "A" },
        }),
        createItem({
          id: "b",
          title: "B",
          time: "10:00",
          transport: "Walking",
          transportDurationMinutes: 15,
          transportDistanceMeters: 900,
          transportDataSource: "google_routes",
          location: { name: "B", lat: 25.002, lng: 121.507, description: "B" },
        }),
      ],
    },
  ];

  const hydrated = hydrateItineraryTransportFields(days, {
    destination: "台北",
    preferredTransport: "Walking",
  });

  assert.equal(hydrated[0]?.items[1]?.transport, "Walking");
  assert.equal(hydrated[0]?.items[1]?.transportDurationMinutes, 15);
  assert.equal(hydrated[0]?.items[1]?.transportDistanceMeters, 900);
  assert.equal(hydrated[0]?.items[1]?.transportDataSource, "google_routes");
});
