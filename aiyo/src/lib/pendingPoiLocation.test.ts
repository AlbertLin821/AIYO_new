import assert from "node:assert/strict";
import test from "node:test";
import {
  displayNameFromCoordinates,
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
