import assert from "node:assert/strict";
import { test } from "node:test";
import { assignFreshIdsForNewTripPayload } from "@/server/data/appStateService";
import type { PersistedTripPayload } from "@/types";

test("assignFreshIdsForNewTripPayload rekeys copied itinerary items and linked pins", () => {
  const source: PersistedTripPayload = {
    tripId: "",
    title: "公開台南（複製）",
    destination: "台南",
    days: 1,
    budget: 0,
    coverImageUrl: null,
    updatedAt: "2026-06-15T00:00:00.000Z",
    itinerary: [
      {
        dayNumber: 1,
        theme: "Day 1",
        items: [
          {
            id: "item-original",
            dayNumber: 1,
            time: "09:00",
            title: "赤崁樓",
            type: "attraction",
            location: {
              name: "赤崁樓",
              lat: 22.9972,
              lng: 120.2023,
              address: "台南市中西區民族路二段212號",
              description: "赤崁樓",
            },
          },
        ],
      },
    ],
    pins: [
      {
        id: "pin-original",
        name: "赤崁樓",
        lat: 22.9972,
        lng: 120.2023,
        description: "赤崁樓",
        linkedTripItemId: "item-original",
      },
    ],
  };

  const copied = assignFreshIdsForNewTripPayload(source);

  assert.equal(copied.tripId, "");
  assert.notEqual(copied.itinerary[0]?.items[0]?.id, "item-original");
  assert.notEqual(copied.pins[0]?.id, "pin-original");
  assert.equal(copied.pins[0]?.linkedTripItemId, copied.itinerary[0]?.items[0]?.id);
  assert.equal(copied.itinerary[0]?.items[0]?.title, "赤崁樓");
  assert.equal(copied.pins[0]?.name, "赤崁樓");
});
