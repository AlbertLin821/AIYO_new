import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { applyAssistantActions } from "@/lib/assistantActions/applyAssistantActions";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import { useMapStore } from "@/stores/useMapStore";

beforeEach(() => {
  useTripStore.setState({
    ...EMPTY_TRIP_STATE,
    tripId: "trip-1",
    title: "東京行",
    destination: "東京",
    days: 1,
    itinerary: [
      {
        dayNumber: 1,
        items: [
          {
            id: "a",
            dayNumber: 1,
            time: "09:00",
            title: "秋葉原",
            type: "attraction",
            location: { name: "秋葉原", lat: 35.6984, lng: 139.773, description: "秋葉原" },
          },
          { id: "b", dayNumber: 1, time: "11:00", title: "上野", type: "attraction" },
        ],
      },
    ],
  });
  useMapStore.setState({
    pins: [
      {
        id: "day_1_a",
        name: "秋葉原",
        lat: 35.6984,
        lng: 139.773,
        description: "秋葉原",
        linkedTripItemId: "a",
        dayNumber: 1,
        source: "itinerary",
      },
    ],
    selectedPinId: null,
    pendingPoi: null,
    focusLocation: null,
    preferredPoiDay: 1,
    panelOpen: true,
    lastSyncedAt: null,
    segmentDirectionsMinutes: {},
  });
});

test("adds item to day", async () => {
  await applyAssistantActions([
    { type: "itinerary.add_item", payload: { dayId: "day-1", item: { title: "晴空塔", location: "Tokyo Skytree" } } },
  ], { persist: false });
  assert.equal(useTripStore.getState().itinerary[0]?.items.length, 3);
  assert.equal(useTripStore.getState().itinerary[0]?.items[2]?.title, "晴空塔");
});

test("updates item title and clears stale coordinates when location lacks lat lng", async () => {
  await applyAssistantActions([
    {
      type: "itinerary.update_item",
      payload: { dayId: "day-1", itemId: "a", patch: { title: "東京晴空塔", location: "Tokyo Skytree" } },
    },
  ], { persist: false });
  const item = useTripStore.getState().itinerary[0]?.items[0];
  assert.equal(item?.title, "東京晴空塔");
  assert.equal(item?.location, undefined);
  assert.equal(useMapStore.getState().pins.some((pin) => pin.linkedTripItemId === "a"), false);
});

test("removes item and linked marker", async () => {
  await applyAssistantActions([
    { type: "itinerary.remove_item", payload: { dayId: "day-1", itemId: "a" } },
  ], { persist: false });
  assert.equal(useTripStore.getState().itinerary[0]?.items.some((item) => item.id === "a"), false);
  assert.equal(useMapStore.getState().pins.length, 0);
});

test("reorders items", async () => {
  await applyAssistantActions([
    { type: "itinerary.reorder_items", payload: { dayId: "day-1", orderedItemIds: ["b", "a"] } },
  ], { persist: false });
  assert.equal(useTripStore.getState().itinerary[0]?.items[0]?.id, "b");
});

test("replaces a day", async () => {
  await applyAssistantActions([
    { type: "itinerary.replace_day", payload: { dayId: "day-1", items: [{ title: "築地市場" }] } },
  ], { persist: false });
  assert.equal(useTripStore.getState().itinerary[0]?.items.length, 1);
  assert.equal(useTripStore.getState().itinerary[0]?.items[0]?.title, "築地市場");
});

test("map.focus_location does not modify trip items", async () => {
  await applyAssistantActions([
    { type: "map.focus_location", payload: { placeName: "清水寺", lat: 34.9949, lng: 135.785, zoom: 15 } },
  ], { persist: false });
  assert.equal(useTripStore.getState().itinerary[0]?.items.length, 2);
  assert.equal(useMapStore.getState().focusLocation?.placeName, "清水寺");
});
