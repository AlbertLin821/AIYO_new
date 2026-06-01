import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlacePhotoProxyUrl,
  isValidPhotoReference,
  resolvePlacePhotoUrl,
} from "@/lib/placePhotoUrl";

const SAMPLE_REF = "CmRaAAAA1234567890abcdefghij";

test("buildPlacePhotoProxyUrl returns same-origin proxy path", () => {
  const url = buildPlacePhotoProxyUrl(SAMPLE_REF, 480);
  assert.equal(url, `/api/map/place-photo?ref=${SAMPLE_REF}&maxwidth=480`);
});

test("resolvePlacePhotoUrl passes through proxy URLs", () => {
  const proxy = buildPlacePhotoProxyUrl(SAMPLE_REF);
  assert.equal(resolvePlacePhotoUrl(proxy), proxy);
});

test("resolvePlacePhotoUrl rewrites legacy Google place photo URLs", () => {
  const legacy = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=480&photo_reference=${SAMPLE_REF}&key=SECRET`;
  assert.equal(resolvePlacePhotoUrl(legacy), buildPlacePhotoProxyUrl(SAMPLE_REF, 480));
});

test("resolvePlacePhotoUrl returns undefined for invalid input", () => {
  assert.equal(resolvePlacePhotoUrl(undefined), undefined);
  assert.equal(resolvePlacePhotoUrl(""), undefined);
  assert.equal(resolvePlacePhotoUrl("https://example.com/photo.jpg"), undefined);
});

test("isValidPhotoReference rejects short refs", () => {
  assert.equal(isValidPhotoReference("short"), false);
  assert.equal(isValidPhotoReference(SAMPLE_REF), true);
});
