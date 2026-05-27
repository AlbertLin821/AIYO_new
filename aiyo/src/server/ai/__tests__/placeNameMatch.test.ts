import assert from "node:assert/strict";
import test from "node:test";
import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import {
  filterProposedChangesByVerifiedPlaces,
  segmentTitleMatchesAnyPlace,
} from "@/server/ai/placeNameMatch";
import type { AiProposedChange } from "@/types";

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

test("filterProposedChangesByVerifiedPlaces keeps adds when no place hits", () => {
  const changes: AiProposedChange[] = [
    {
      type: "add_itinerary_item",
      day: 1,
      time: "10:00",
      title: "測試餐廳",
      locationName: "測試餐廳",
      source: "ai-chat",
    },
  ];
  const filtered = filterProposedChangesByVerifiedPlaces(changes, []);
  assert.equal(filtered.length, 1);
});
