import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";
import { syncService } from "@/services/syncService";
import { EMPTY_TRIP_STATE, useTripStore } from "@/stores/useTripStore";
import { useMapStore } from "@/stores/useMapStore";
import type { PersistedTripPayload } from "@/types";

const originalFetch = globalThis.fetch;

function setTitle(title: string) {
  useTripStore.getState().setItinerary([{ dayNumber: 1, items: [{ id: "item-a", title, type: "attraction", time: "09:00", notes: "" }] }]);
}

beforeEach(() => {
  syncService.resetSessionState();
  useTripStore.setState({ ...EMPTY_TRIP_STATE, tripId: "trip-edit-test" });
  useMapStore.setState({ pins: [] });
  setTitle("original");
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  syncService.resetSessionState();
});

test("an old acknowledgement cannot replace edits made while saving; latest edit is persisted", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const writes: PersistedTripPayload[] = [];
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as PersistedTripPayload;
    writes.push(payload);
    if (writes.length === 1) await pending;
    return Response.json({ success: true, data: payload });
  };
  const saving = syncService.flushTripSyncNow({ force: true });
  setTitle("renamed while saving");
  release();
  await saving;
  assert.deepEqual(writes.map((write) => write.itinerary[0].items[0].title), ["original", "renamed while saving"]);
  assert.equal(useTripStore.getState().itinerary[0].items[0].title, "renamed while saving");
});

test("forced saves are serialized and a deletion made during the first save survives", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let inFlight = 0;
  let maximumInFlight = 0;
  const writes: PersistedTripPayload[] = [];
  globalThis.fetch = async (_url, init) => {
    inFlight += 1;
    maximumInFlight = Math.max(maximumInFlight, inFlight);
    const payload = JSON.parse(String(init?.body)) as PersistedTripPayload;
    writes.push(payload);
    if (writes.length === 1) await pending;
    inFlight -= 1;
    return Response.json({ success: true, data: payload });
  };
  const first = syncService.flushTripSyncNow({ force: true });
  useTripStore.getState().setItinerary([{ dayNumber: 1, items: [] }]);
  const second = syncService.flushTripSyncNow({ force: true });
  assert.equal(writes.length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(maximumInFlight, 1);
  assert.equal(writes.at(-1)?.itinerary[0].items.length, 0);
  assert.equal(useTripStore.getState().itinerary[0].items.length, 0);
});

test("switching trip while saving never restores the previous trip", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body)) as PersistedTripPayload;
    await pending;
    return Response.json({ success: true, data: payload });
  };
  const saving = syncService.flushTripSyncNow({ force: true });
  useTripStore.setState({ tripId: "other-trip" });
  setTitle("other trip activity");
  release();
  await saving;
  assert.equal(useTripStore.getState().tripId, "other-trip");
  assert.equal(useTripStore.getState().itinerary[0].items[0].title, "other trip activity");
});

test("late background geocoding cannot undo rename/delete or restore the old order", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  useTripStore.getState().setItinerary([{ dayNumber: 1, items: [
    { id: "item-a", title: "old A", type: "attraction", time: "09:00" },
    { id: "item-b", title: "delete B", type: "attraction", time: "11:00" },
  ] }]);
  globalThis.fetch = async () => {
    await pending;
    return Response.json({ success: true, data: { place: {
      placeName: "old place", lat: 25.03, lng: 121.56, provider: "google-geocoding", confidence: 0.9,
    } } });
  };
  const hydrating = syncService.hydrateCurrentTripLocationsIfNeeded({ force: true });
  useTripStore.getState().updateItineraryItem(1, "item-a", { title: "renamed A" });
  useTripStore.getState().removeItineraryItem(1, "item-b");
  release();
  await hydrating;
  assert.deepEqual(useTripStore.getState().itinerary[0].items.map((item) => item.title), ["renamed A"]);
  assert.equal(useTripStore.getState().itinerary[0].items[0].location, undefined);
});
