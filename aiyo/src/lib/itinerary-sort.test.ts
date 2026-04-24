import assert from "node:assert/strict";
import test from "node:test";
import { sortItineraries, type ItineraryListItem } from "@/lib/itinerary-sort";

const itineraries: ItineraryListItem[] = [
  { id: "b", title: "B", destination: "台中", days: 2, createdAt: "2026-01-01", updatedAt: "2026-01-02" },
  { id: "a", title: "A", destination: "台南", days: 3, createdAt: "2026-01-02", updatedAt: "2026-01-01" },
];

test("sortItineraries sorts by destination", () => {
  assert.deepEqual(sortItineraries(itineraries, "destination_asc").map((item) => item.id), ["b", "a"]);
});

test("sortItineraries sorts by updated time", () => {
  assert.deepEqual(sortItineraries(itineraries, "updatedAt_desc").map((item) => item.id), ["b", "a"]);
});
