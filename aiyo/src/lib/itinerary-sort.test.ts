import assert from "node:assert/strict";
import test from "node:test";
import { filterItineraries, sortItineraries, type ItineraryListItem } from "@/lib/itinerary-sort";

const itineraries: ItineraryListItem[] = [
  { id: "b", title: "B", destination: "台中", days: 2, createdAt: "2026-01-01", updatedAt: "2026-01-02", folderName: "美食" },
  { id: "a", title: "A", destination: "台南", days: 3, createdAt: "2026-01-02", updatedAt: "2026-01-01", folderName: "古蹟" },
];

test("sortItineraries sorts by destination", () => {
  assert.deepEqual(sortItineraries(itineraries, "destination_asc").map((item) => item.id), ["b", "a"]);
});

test("sortItineraries sorts by updated time", () => {
  assert.deepEqual(sortItineraries(itineraries, "updatedAt_desc").map((item) => item.id), ["b", "a"]);
});

test("filterItineraries matches name destination folder and date", () => {
  assert.deepEqual(filterItineraries(itineraries, "台南").map((item) => item.id), ["a"]);
  assert.deepEqual(filterItineraries(itineraries, "美食").map((item) => item.id), ["b"]);
  assert.deepEqual(filterItineraries(itineraries, "2026-01-02").map((item) => item.id), ["b", "a"]);
});
