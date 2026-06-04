import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPlacePhotoProxyUrl,
  hasUsablePlacePhotoUrl,
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

test("resolvePlacePhotoUrl preserves proxy URLs and appends placeId when provided", () => {
  const proxy = buildPlacePhotoProxyUrl(SAMPLE_REF);
  assert.equal(
    resolvePlacePhotoUrl(proxy, "place-123"),
    `${proxy}&placeId=place-123`,
  );
});

test("resolvePlacePhotoUrl rewrites legacy Google place photo URLs", () => {
  const legacy = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=480&photo_reference=${SAMPLE_REF}&key=SECRET`;
  assert.equal(resolvePlacePhotoUrl(legacy), buildPlacePhotoProxyUrl(SAMPLE_REF, 480));
});

test("resolvePlacePhotoUrl rewrites legacy Google place photo URLs and appends placeId", () => {
  const legacy = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=480&photo_reference=${SAMPLE_REF}&key=SECRET`;
  assert.equal(
    resolvePlacePhotoUrl(legacy, "place-456"),
    `${buildPlacePhotoProxyUrl(SAMPLE_REF, 480)}&placeId=place-456`,
  );
});

test("resolvePlacePhotoUrl passes through regular https image URLs", () => {
  assert.equal(resolvePlacePhotoUrl("https://example.com/photo.jpg"), "https://example.com/photo.jpg");
});

test("resolvePlacePhotoUrl passes through same-origin relative image paths", () => {
  assert.equal(resolvePlacePhotoUrl("/images/photo.jpg"), "/images/photo.jpg");
});

test("resolvePlacePhotoUrl returns undefined for invalid input", () => {
  assert.equal(resolvePlacePhotoUrl(undefined), undefined);
  assert.equal(resolvePlacePhotoUrl(""), undefined);
  assert.equal(resolvePlacePhotoUrl("javascript:alert(1)"), undefined);
});

test("hasUsablePlacePhotoUrl rejects proxy-backed place photos", () => {
  assert.equal(hasUsablePlacePhotoUrl(`/api/map/place-photo?ref=${SAMPLE_REF}&maxwidth=480`), false);
  assert.equal(
    hasUsablePlacePhotoUrl(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=480&photo_reference=${SAMPLE_REF}`),
    false,
  );
});

test("hasUsablePlacePhotoUrl accepts direct image URLs", () => {
  assert.equal(hasUsablePlacePhotoUrl("https://example.com/photo.jpg"), true);
  assert.equal(hasUsablePlacePhotoUrl("/images/photo.jpg"), true);
});

test("isValidPhotoReference rejects short refs", () => {
  assert.equal(isValidPhotoReference("short"), false);
  assert.equal(isValidPhotoReference(SAMPLE_REF), true);
});
