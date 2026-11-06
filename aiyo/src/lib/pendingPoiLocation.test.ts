import assert from "node:assert/strict";
import test from "node:test";
import {
  displayNameFromCoordinates,
  fetchPendingPoiLocation,
  isOsmPlaceId,
  isPlusCodeDisplayName,
  isResolvableMapPickLocation,
} from "@/lib/pendingPoiLocation";

test("isResolvableMapPickLocation rejects coordinate-only name", () => {
  const lat = 25.033;
  const lng = 121.5654;
  assert.equal(
    isResolvableMapPickLocation(
      { name: displayNameFromCoordinates(lat, lng), lat, lng },
      lat,
      lng,
    ),
    false,
  );
});

test("identifies OSM place IDs so photo enrichment does not request Google details", () => {
  assert.equal(isOsmPlaceId("photon:node:123"), true);
  assert.equal(isOsmPlaceId("overpass:way:456"), true);
  assert.equal(isOsmPlaceId("N:123"), true);
  assert.equal(isOsmPlaceId("ChIJabc"), false);
});

test("sourced OSM search result can be added without legacy place details", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("legacy details must not be called"); };
  try {
    const location = await fetchPendingPoiLocation({ placeId: "photon:node:123", name: "嘉義公園", address: "嘉義市", lat: 23.483, lng: 120.458, resolvedFrom: "photon", checkedAt: "2026-11-05T00:00:00.000Z" }, "嘉義");
    assert.equal(location.name, "嘉義公園");
    assert.equal(location.resolvedFrom, "photon");
    assert.equal(location.checkedAt, "2026-11-05T00:00:00.000Z");
  } finally { globalThis.fetch = previous; }
});

test("isResolvableMapPickLocation accepts normal place name", () => {
  const lat = 25.033;
  const lng = 121.5654;
  assert.equal(
    isResolvableMapPickLocation(
      { name: "台北 101", lat, lng },
      lat,
      lng,
    ),
    true,
  );
});

test("isResolvableMapPickLocation rejects plus code style name", () => {
  const lat = 25.033;
  const lng = 121.5654;
  assert.equal(isPlusCodeDisplayName("XHP5+2Q"), true);
  assert.equal(
    isResolvableMapPickLocation({ name: "XHP5+2Q", lat, lng }, lat, lng),
    false,
  );
});

test("isResolvableMapPickLocation rejects empty name", () => {
  const lat = 25.033;
  const lng = 121.5654;
  assert.equal(isResolvableMapPickLocation({ name: " ", lat, lng }, lat, lng), false);
});
