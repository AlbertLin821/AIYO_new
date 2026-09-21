import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedPlacePhotoContentType, parsePlacePhotoWidth } from "./placePhotoProxyPolicy";

test("place photo width accepts only bounded integers", () => {
  assert.equal(parsePlacePhotoWidth(null), 480);
  assert.equal(parsePlacePhotoWidth("1600"), 1600);
  assert.equal(parsePlacePhotoWidth("0"), null);
  assert.equal(parsePlacePhotoWidth("1601"), null);
  assert.equal(parsePlacePhotoWidth("12.5"), null);
});

test("place photo response accepts image MIME types only", () => {
  assert.equal(isAllowedPlacePhotoContentType("image/jpeg; charset=binary"), true);
  assert.equal(isAllowedPlacePhotoContentType("text/html"), false);
  assert.equal(isAllowedPlacePhotoContentType(null), false);
});
