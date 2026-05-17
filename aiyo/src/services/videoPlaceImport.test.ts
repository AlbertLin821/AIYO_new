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
});

afterEach(() => {
  mock.reset();
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
