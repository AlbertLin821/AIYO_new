import assert from "node:assert/strict";
import test from "node:test";
import { mapRegionForPoint, sharedMapRegion } from "./region";

test("routes representative Taiwan, Japan, Korea places to regional services", () => {
  assert.equal(mapRegionForPoint({ lat: 25.033, lng: 121.565 }), "TW");
  assert.equal(mapRegionForPoint({ lat: 35.7148, lng: 139.7967 }), "JP");
  assert.equal(mapRegionForPoint({ lat: 33.5902, lng: 130.4017 }), "JP");
  assert.equal(mapRegionForPoint({ lat: 37.5665, lng: 126.978 }), "KR");
  assert.equal(mapRegionForPoint({ lat: 33.4996, lng: 126.5312 }), "KR");
  assert.equal(sharedMapRegion([{ lat: 25.033, lng: 121.565 }, { lat: 35.7148, lng: 139.7967 }]), null);
});

test("uses regional extract polygons for islands and excludes foreign points inside old bounding boxes", () => {
  assert.equal(mapRegionForPoint({ lat: 26.16, lng: 119.94 }), "TW"); // Matsu
  assert.equal(mapRegionForPoint({ lat: 26.21, lng: 127.68 }), "JP"); // Okinawa
  assert.equal(mapRegionForPoint({ lat: 31, lng: 123 }), null); // East China coast
  assert.equal(mapRegionForPoint({ lat: 39.03, lng: 125.75 }), null); // Pyongyang
  assert.equal(mapRegionForPoint({ lat: 45, lng: 135 }), null); // Primorsky Krai
  assert.equal(mapRegionForPoint({ lat: Number.NaN, lng: 121.5 }), null);
  assert.equal(sharedMapRegion([{ lat: 26.16, lng: 119.94 }, { lat: 25.033, lng: 121.565 }]), "TW");
});
