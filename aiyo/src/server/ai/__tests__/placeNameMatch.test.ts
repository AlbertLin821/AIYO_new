import assert from "node:assert/strict";
import test from "node:test";
import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import { segmentTitleMatchesAnyPlace } from "@/server/ai/placeNameMatch";

test("segmentTitleMatchesAnyPlace accepts close title to place name", () => {
  const places: PlaceSearchHit[] = [
    {
      name: "林聰明砂鍋魚頭",
      formattedAddress: "嘉義市",
      lat: 23.47,
      lng: 120.44,
      placeId: "p1",
      types: ["restaurant"],
    },
  ];
  assert.equal(segmentTitleMatchesAnyPlace("林聰明 砂鍋魚頭", places), true);
});

test("segmentTitleMatchesAnyPlace rejects unrelated title", () => {
  const places: PlaceSearchHit[] = [
    {
      name: "文化路夜市",
      formattedAddress: "嘉義市",
      lat: 23.48,
      lng: 120.45,
      placeId: "p2",
      types: ["tourist_attraction"],
    },
  ];
  assert.equal(segmentTitleMatchesAnyPlace("完全不相干店名", places), false);
});
