import test from "node:test";
import assert from "node:assert/strict";
import {
  addPlaceToItinerary,
  itineraryHasPlaceId,
  nextActivityTime,
} from "@/lib/addPlaceToItinerary";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import type { TripPlanDay, TripPlanItem } from "@/types";

test("nextActivityTime defaults to 16:00 when day has no timed items", () => {
  assert.equal(nextActivityTime([]), "16:00");
});

test("nextActivityTime increments hour from last item", () => {
  const items: TripPlanItem[] = [
    { id: "a", title: "A", type: "activity", time: "09:30" },
  ];
  assert.equal(nextActivityTime(items), "10:30");
});

test("itineraryHasPlaceId detects duplicate placeId", () => {
  const itinerary: TripPlanDay[] = [
    {
      dayNumber: 1,
      items: [
        {
          id: "x",
          title: "Spot",
          type: "activity",
          time: "10:00",
          location: {
            name: "Spot",
            lat: 25,
            lng: 121,
            description: "Spot",
            placeId: "ChIJabc",
          },
        },
      ],
    },
  ];
  assert.equal(itineraryHasPlaceId(itinerary, "ChIJabc"), true);
  assert.equal(itineraryHasPlaceId(itinerary, "other"), false);
});

test("addPlaceToItinerary creates item and pin", () => {
  useTripStore.setState({
    itinerary: [{ dayNumber: 1, items: [] }],
  });
  useMapStore.setState({ pins: [], selectedPinId: null });

  const result = addPlaceToItinerary({
    dayNumber: 1,
    itemId: "manual_1_1",
    location: {
      name: "台北 101",
      lat: 25.0339,
      lng: 121.5645,
      description: "台北 101",
      placeId: "pid-101",
      verified: true,
    },
  });

  assert.equal(result.itemId, "manual_1_1");
  assert.equal(result.pinId, "day_1_manual_1_1");

  const item = useTripStore.getState().itinerary[0]?.items[0];
  assert.equal(item?.title, "台北 101");
  assert.equal(item?.location?.placeId, "pid-101");

  const pin = useMapStore.getState().pins.find((entry) => entry.id === result.pinId);
  assert.equal(pin?.linkedTripItemId, "manual_1_1");
  assert.equal(useMapStore.getState().selectedPinId, result.pinId);
});
