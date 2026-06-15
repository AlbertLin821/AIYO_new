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

test("trip.update_metadata can extend trip days without changing existing items", async () => {
  await applyAssistantActions([
    { type: "trip.update_metadata", payload: { days: 3 } },
  ], { persist: false });

  const state = useTripStore.getState();
  assert.equal(state.days, 3);
  assert.equal(state.itinerary.length, 3);
  assert.equal(state.itinerary[0]?.items[0]?.title, "秋葉原");
  assert.deepEqual(state.itinerary[1]?.items, []);
  assert.deepEqual(state.itinerary[2]?.items, []);
});

test("move item to missing day extends itinerary before add_item", async () => {
  useTripStore.setState({
    days: 1,
    itinerary: [
      {
        dayNumber: 1,
        theme: "Day 1",
        summary: "",
        items: [{ id: "market", time: "10:00", title: "新港漁市場", type: "attraction" }],
      },
    ],
  });

  const result = await applyAssistantActions([
    { type: "trip.update_metadata", payload: { days: 2 } },
    { type: "itinerary.remove_item", payload: { dayId: "day-1", itemId: "market" } },
    {
      type: "itinerary.add_item",
      payload: {
        dayId: "day-2",
        item: { title: "新港漁市場", startTime: "10:00", source: "assistant" },
      },
    },
  ], { persist: false, geocode: false });

  assert.equal(result.appliedCount, 3);
  assert.equal(result.skippedCount, 0);
  const state = useTripStore.getState();
  assert.equal(state.itinerary.length, 2);
  assert.deepEqual(state.itinerary[0]?.items, []);
  assert.equal(state.itinerary[1]?.items[0]?.title, "新港漁市場");
});

test("add_item auto-extends itinerary when target day is missing but dayNumber is valid", async () => {
  useTripStore.setState({
    days: 1,
    itinerary: [
      {
        dayNumber: 1,
        theme: "Day 1",
        summary: "",
        items: [],
      },
    ],
  });

  const result = await applyAssistantActions([
    {
      type: "itinerary.add_item",
      payload: {
        dayId: "day-2",
        item: { title: "新港漁市場", startTime: "10:00", source: "assistant" },
      },
    },
  ], { persist: false, geocode: false });

  assert.equal(result.appliedCount, 1);
  assert.equal(useTripStore.getState().itinerary.length, 2);
  assert.equal(useTripStore.getState().itinerary[1]?.items[0]?.title, "新港漁市場");
});

test("updates item time and transport fields", async () => {
  await applyAssistantActions([
    {
      type: "itinerary.update_item",
      payload: { dayId: "day-1", itemId: "b", patch: { startTime: "10:30", transport: "計程車" } },
    },
  ], { persist: false });

  const item = useTripStore.getState().itinerary[0]?.items.find((candidate) => candidate.id === "b");
  assert.equal(item?.time, "10:30");
  assert.equal(item?.transport, "計程車");
});

test("replaying same add_item action for same message is idempotent", async () => {
  const action = {
    type: "itinerary.add_item" as const,
    payload: {
      dayId: "day-1",
      item: { title: "晴空塔", location: "Tokyo Skytree", source: "assistant" as const },
    },
  };

  const first = await applyAssistantActions([action], {
    persist: false,
    geocode: false,
    requestId: "message-1",
  });
  const second = await applyAssistantActions([action], {
    persist: false,
    geocode: false,
    requestId: "message-1",
  });

  const skytreeItems = useTripStore
    .getState()
    .itinerary[0]?.items.filter((item) => item.title === "晴空塔") || [];
  assert.equal(first.appliedCount, 1);
  assert.equal(second.appliedCount, 0);
  assert.equal(second.alreadyAppliedCount, 1);
  assert.equal(skytreeItems.length, 1);
});

test("concurrent same-request add_item retry does not create duplicate", async () => {
  const action = {
    type: "itinerary.add_item" as const,
    payload: {
      dayId: "day-1",
      item: { title: "晴空塔", location: "Tokyo Skytree", source: "assistant" as const },
    },
  };

  await Promise.all([
    applyAssistantActions([action], { persist: false, geocode: false, requestId: "message-concurrent" }),
    applyAssistantActions([action], { persist: false, geocode: false, requestId: "message-concurrent" }),
  ]);

  const skytreeItems = useTripStore
    .getState()
    .itinerary[0]?.items.filter((item) => item.title === "晴空塔") || [];
  assert.equal(skytreeItems.length, 1);
});

test("refresh replay with same request id returns already applied", async () => {
  const action = {
    type: "itinerary.add_item" as const,
    payload: {
      dayId: "day-1",
      item: { title: "晴空塔", location: "Tokyo Skytree", source: "assistant" as const },
    },
  };
  await applyAssistantActions([action], { persist: false, geocode: false, requestId: "message-refresh" });

  const replay = await applyAssistantActions([action], {
    persist: false,
    geocode: false,
    requestId: "message-refresh",
  });

  assert.equal(replay.alreadyAppliedCount, 1);
  assert.equal(
    useTripStore.getState().itinerary[0]?.items.filter((item) => item.title === "晴空塔").length,
    1,
  );
});

test("same place name from different messages is not treated as duplicate", async () => {
  const action = {
    type: "itinerary.add_item" as const,
    payload: {
      dayId: "day-1",
      item: { title: "晴空塔", location: "Tokyo Skytree", source: "assistant" as const },
    },
  };

  await applyAssistantActions([action], { persist: false, geocode: false, requestId: "message-1" });
  await applyAssistantActions([action], { persist: false, geocode: false, requestId: "message-2" });

  const skytreeItems = useTripStore
    .getState()
    .itinerary[0]?.items.filter((item) => item.title === "晴空塔") || [];
  assert.equal(skytreeItems.length, 2);
});

test("same message can add two separate same-name items by action index", async () => {
  const result = await applyAssistantActions(
    [
      {
        type: "itinerary.add_item",
        payload: { dayId: "day-1", item: { title: "午餐", source: "assistant" } },
      },
      {
        type: "itinerary.add_item",
        payload: { dayId: "day-1", item: { title: "午餐", startTime: "18:00", source: "assistant" } },
      },
    ],
    { persist: false, geocode: false, requestId: "message-3" },
  );

  const meals = useTripStore.getState().itinerary[0]?.items.filter((item) => item.title === "午餐") || [];
  assert.equal(result.appliedCount, 2);
  assert.equal(meals.length, 2);
});

test("partial action result reports success and validation failure reasons", async () => {
  const result = await applyAssistantActions(
    [
      {
        type: "itinerary.add_item",
        payload: { dayId: "day-1", item: { title: "晴空塔", source: "assistant" } },
      },
      {
        type: "itinerary.add_item",
        payload: { dayId: "day-99", item: { title: "不存在的第九十九天", source: "assistant" } },
      },
    ],
    { persist: false, geocode: false, requestId: "message-partial" },
  );

  assert.equal(result.appliedCount, 1);
  assert.equal(result.skippedCount, 1);
  assert.deepEqual(result.summary.succeeded.map((entry) => entry.actionIndex), [0]);
  assert.deepEqual(result.summary.failed.map((entry) => entry.reason), ["dayId does not exist in current trip"]);
});
