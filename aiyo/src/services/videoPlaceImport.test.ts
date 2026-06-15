import assert from "node:assert/strict";
import { afterEach, beforeEach, mock, test } from "node:test";
import { syncService } from "@/services/syncService";
import { importVideoVerifiedPlacesToTrip } from "@/services/videoPlaceImport";
import { useMapStore } from "@/stores/useMapStore";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import type { Video } from "@/types";

const sampleLocation = {
  name: "林聰明砂鍋魚頭",
  lat: 23.4773,
  lng: 120.4496,
  description: "嘉義知名砂鍋魚頭店",
  verified: true,
  confidence: 0.91,
};
const originalFetch = globalThis.fetch;

function buildVideo(overrides: Partial<Video> = {}): Video {
  return {
    id: "video-1",
    videoId: "abc123",
    title: "嘉義美食",
    thumbnail: "",
    url: "https://youtu.be/abc123",
    duration: "10:00",
    summary: "",
    description: "",
    source: "youtube",
    timestamps: [],
    extractedLocations: [sampleLocation],
    ...overrides,
  };
}

beforeEach(() => {
  useTripStore.setState({ ...EMPTY_TRIP_STATE, tripId: "trip-test" });
  useMapStore.setState({
    pins: [],
    selectedPinId: null,
    panelOpen: true,
    lastSyncedAt: null,
    segmentDirectionsMinutes: {},
  });
  mock.method(syncService, "flushTripSyncNow", async () => undefined);
  globalThis.fetch = originalFetch;
});

afterEach(() => {
  mock.reset();
  globalThis.fetch = originalFetch;
});

test("importVideoVerifiedPlacesToTrip creates days up to targetDayNumber", async () => {
  const result = await importVideoVerifiedPlacesToTrip(buildVideo(), {
    selectedNames: [sampleLocation.name],
    targetDayNumber: 3,
  });

  assert.equal(result.addedItems, 1);
  const itinerary = useTripStore.getState().itinerary;
  assert.equal(itinerary.length, 3);
  assert.deepEqual(
    itinerary.map((day) => day.dayNumber),
    [1, 2, 3],
  );
  assert.equal(itinerary[2]?.items[0]?.dayNumber, 3);
  assert.equal(itinerary[2]?.items[0]?.title, sampleLocation.name);
});

test("importVideoVerifiedPlacesToTrip ignores unverified fallback coordinates", async () => {
  const result = await importVideoVerifiedPlacesToTrip(
    buildVideo({
      extractedLocations: [
        {
          ...sampleLocation,
          name: "嘉義",
          verified: false,
          resolvedFrom: "llm",
          geocodeRejectedReason: "segment-hint-no-geocode",
        },
      ],
    }),
    {
      selectedNames: ["嘉義"],
      targetDayNumber: 1,
    },
  );

  assert.equal(result.addedItems, 0);
  assert.equal(result.addedPins, 0);
  assert.equal(useTripStore.getState().itinerary.length, 0);
  assert.equal(useMapStore.getState().pins.length, 0);
});

test("importVideoVerifiedPlacesToTrip keeps pin linked to the matching place after pin sorting", async () => {
  const lowerConfidenceLocation = {
    ...sampleLocation,
    name: "文化路夜市",
    confidence: 0.7,
  };
  const higherConfidenceLocation = {
    ...sampleLocation,
    name: "檜意森活村",
    lat: 23.485,
    lng: 120.456,
    confidence: 0.95,
  };

  const result = await importVideoVerifiedPlacesToTrip(
    buildVideo({
      extractedLocations: [lowerConfidenceLocation, higherConfidenceLocation],
    }),
    {
      selectedNames: [lowerConfidenceLocation.name, higherConfidenceLocation.name],
      targetDayNumber: 1,
    },
  );

  assert.equal(result.addedItems, 2);
  assert.equal(result.addedPins, 2);

  const itinerary = useTripStore.getState().itinerary[0]?.items ?? [];
  const pins = useMapStore.getState().pins;
  const itemById = new Map(itinerary.map((item) => [item.id, item]));

  for (const pin of pins) {
    const item = pin.linkedTripItemId ? itemById.get(pin.linkedTripItemId) : null;
    assert.ok(item, `expected linked item for pin ${pin.name}`);
    assert.equal(item?.location?.name, pin.name);
    assert.equal(item?.location?.lat, pin.lat);
    assert.equal(item?.location?.lng, pin.lng);
  }
});

test("importVideoVerifiedPlacesToTrip enriches imported place photos when placeId exists", async () => {
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        success: true,
        data: {
          results: [
            {
              details: {
                photoUrl: "/api/map/place-photo?ref=chiayi-fish&placeId=fish-head",
                thumbnail: "/api/map/place-photo?ref=chiayi-fish&placeId=fish-head",
              },
            },
          ],
        },
      }),
      { status: 200 },
    );

  await importVideoVerifiedPlacesToTrip(
    buildVideo({
      extractedLocations: [
        {
          ...sampleLocation,
          placeId: "fish-head",
        },
      ],
    }),
    {
      selectedNames: [sampleLocation.name],
      targetDayNumber: 1,
    },
  );

  const item = useTripStore.getState().itinerary[0]?.items[0];
  const pin = useMapStore.getState().pins[0];
  assert.equal(item?.location?.photoUrl, "/api/map/place-photo?ref=chiayi-fish&placeId=fish-head");
  assert.equal(pin?.photoUrl, "/api/map/place-photo?ref=chiayi-fish&placeId=fish-head");
});
