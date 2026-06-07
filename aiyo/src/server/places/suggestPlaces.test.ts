import assert from "node:assert/strict";
import test from "node:test";
import { mergeStrictAndRelaxedSuggestions, pickAutoResolveSuggestion } from "@/server/places/geocodePlace";
import type { PlaceSuggestion } from "@/types/geocode";

function suggestion(partial: Partial<PlaceSuggestion> & Pick<PlaceSuggestion, "placeName">): PlaceSuggestion {
  return {
    formattedAddress: partial.formattedAddress ?? partial.placeName,
    placeId: partial.placeId ?? "place-1",
    lat: partial.lat ?? 35.0,
    lng: partial.lng ?? 139.0,
    provider: partial.provider ?? "google-geocoding",
    confidence: partial.confidence ?? 0.7,
    sourceQuery: partial.sourceQuery ?? partial.placeName,
    ...partial,
  };
}

test("pickAutoResolveSuggestion auto-resolves exact high-confidence match", () => {
  const resolved = pickAutoResolveSuggestion("道頓堀", [
    suggestion({ placeName: "道頓堀", confidence: 0.9 }),
    suggestion({ placeName: "道頓堀別館", confidence: 0.75, placeId: "place-2" }),
  ]);
  assert.equal(resolved?.placeName, "道頓堀");
});

test("pickAutoResolveSuggestion requires user choice when matches are close", () => {
  const resolved = pickAutoResolveSuggestion("拉麵", [
    suggestion({ placeName: "一蘭拉麵", confidence: 0.78, placeId: "a" }),
    suggestion({ placeName: "一風堂", confidence: 0.76, placeId: "b" }),
  ]);
  assert.equal(resolved, null);
});

test("pickAutoResolveSuggestion auto-resolves clear top candidate", () => {
  const resolved = pickAutoResolveSuggestion("東京晴空塔", [
    suggestion({ placeName: "東京晴空塔", confidence: 0.91, placeId: "a" }),
    suggestion({ placeName: "其他地點", confidence: 0.6, placeId: "b" }),
  ]);
  assert.equal(resolved?.placeId, "a");
});

test("mergeStrictAndRelaxedSuggestions keeps relaxed candidates when strict pool is empty", () => {
  const relaxed = [
    suggestion({
      placeName: "一蘭拉麵 道頓堀店",
      confidence: 0.45,
      needsUserConfirm: true,
      placeId: "relaxed-1",
    }),
  ];
  const merged = mergeStrictAndRelaxedSuggestions([], relaxed, 5);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.placeId, "relaxed-1");
  assert.equal(merged[0]?.needsUserConfirm, true);
});

test("mergeStrictAndRelaxedSuggestions prefers strict over duplicate relaxed entries", () => {
  const strict = [suggestion({ placeName: "道頓堀", confidence: 0.82, placeId: "same-place" })];
  const relaxed = [
    suggestion({
      placeName: "道頓堀",
      confidence: 0.4,
      needsUserConfirm: true,
      placeId: "same-place",
    }),
    suggestion({ placeName: "心齋橋", confidence: 0.38, needsUserConfirm: true, placeId: "other" }),
  ];
  const merged = mergeStrictAndRelaxedSuggestions(strict, relaxed, 5);
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.confidence, 0.82);
  assert.notEqual(merged[0]?.needsUserConfirm, true);
});
