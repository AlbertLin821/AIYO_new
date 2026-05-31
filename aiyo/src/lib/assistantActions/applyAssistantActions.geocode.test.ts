import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { applyAssistantActions } from "@/lib/assistantActions/applyAssistantActions";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import { useMapStore } from "@/stores/useMapStore";

const originalFetch = globalThis.fetch;

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

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("update_item without coordinates geocodes and replaces marker", async () => {
  globalThis.fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (String(url).includes("/api/places/geocode")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            place: {
              placeName: "Tokyo Skytree",
              formattedAddress: "Tokyo Skytree, Tokyo",
              placeId: "skytree",
              lat: 35.7101,
              lng: 139.8107,
              provider: "google-geocoding",
            },
          },
        }),
        { status: 200 },
      );
    }
    return originalFetch(input);
  };

  await applyAssistantActions(
    [
      {
        type: "itinerary.update_item",
        payload: {
          dayId: "day-1",
          itemId: "a",
          patch: { title: "東京晴空塔", location: "Tokyo Skytree" },
        },
      },
    ],
    { persist: false, geocode: true },
  );

  const item = useTripStore.getState().itinerary[0]?.items[0];
  assert.equal(item?.title, "東京晴空塔");
  assert.equal(item?.location?.lat, 35.7101);
  assert.equal(item?.location?.placeId, "skytree");
  assert.equal(useMapStore.getState().pins.some((pin) => pin.linkedTripItemId === "a"), true);
  assert.equal(useMapStore.getState().pins.some((pin) => pin.name.includes("秋葉原")), false);
});

test("geocode failure keeps text item without marker", async () => {
  globalThis.fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (String(url).includes("/api/places/geocode")) {
      return new Response(
        JSON.stringify({
          success: false,
          error: { code: "missing_api_key", message: "no key" },
        }),
        { status: 503 },
      );
    }
    return originalFetch(input);
  };

  await applyAssistantActions(
    [
      {
        type: "itinerary.update_item",
        payload: {
          dayId: "day-1",
          itemId: "a",
          patch: { title: "未知地點", location: "Unknown Place XYZ" },
        },
      },
    ],
    { persist: false, geocode: true },
  );

  const item = useTripStore.getState().itinerary[0]?.items[0];
  assert.equal(item?.title, "未知地點");
  assert.equal(item?.location, undefined);
  assert.equal(useMapStore.getState().pins.length, 0);
});

test("map.focus_location without coordinates geocodes focus only", async () => {
  globalThis.fetch = async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof Request
          ? input.url
          : String(input);
    if (String(url).includes("/api/places/geocode")) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            place: {
              placeName: "清水寺",
              lat: 34.9949,
              lng: 135.785,
              provider: "google-geocoding",
            },
          },
        }),
        { status: 200 },
      );
    }
    return originalFetch(input);
  };

  const countBefore = useTripStore.getState().itinerary[0]?.items.length;
  await applyAssistantActions(
    [{ type: "map.focus_location", payload: { placeName: "清水寺" } }],
    { persist: false, geocode: true },
  );
  assert.equal(useTripStore.getState().itinerary[0]?.items.length, countBefore);
  assert.equal(useMapStore.getState().focusLocation?.placeName, "清水寺");
  assert.equal(useMapStore.getState().focusLocation?.lat, 34.9949);
});
