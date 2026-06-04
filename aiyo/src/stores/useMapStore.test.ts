import assert from "node:assert/strict";
import test from "node:test";

import { useMapStore } from "@/stores/useMapStore";

function resetMapStore() {
  useMapStore.setState({
    pins: [],
    selectedPinId: null,
    pendingPoi: null,
    focusLocation: null,
    preferredPoiDay: 1,
    panelOpen: true,
    visibleRouteDayNumbers: [],
    lastSyncedAt: null,
    segmentDirectionsMinutes: {},
  });
}

test("toggleVisibleRouteDayNumber stores a selected day and clears when toggled off", () => {
  resetMapStore();

  useMapStore.getState().toggleVisibleRouteDayNumber(2);
  assert.deepEqual(useMapStore.getState().visibleRouteDayNumbers, [2]);

  useMapStore.getState().toggleVisibleRouteDayNumber(2);
  assert.deepEqual(useMapStore.getState().visibleRouteDayNumbers, []);
});

test("clearPins also resets visible route day filters", () => {
  resetMapStore();
  useMapStore.getState().setVisibleRouteDayNumbers([1, 3]);

  useMapStore.getState().clearPins();

  assert.deepEqual(useMapStore.getState().visibleRouteDayNumbers, []);
});
