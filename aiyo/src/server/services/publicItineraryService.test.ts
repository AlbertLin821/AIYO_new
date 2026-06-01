import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildPublicationSearchText,
  buildPublicSnapshot,
  assertTripPublishable,
} from "@/server/services/publicItineraryService";
import type { PersistedTripPayload } from "@/types";

const samplePayload: PersistedTripPayload = {
  tripId: "trip-1",
  title: "嘉義兩日遊",
  destination: "嘉義",
  days: 2,
  budget: 12000,
  coverImageUrl: "https://example.com/cover.jpg",
  updatedAt: "2026-05-26T00:00:00.000Z",
  itinerary: [
    {
      dayNumber: 1,
      theme: "文化與美食",
      summary: "私人摘要",
      items: [
        {
          id: "item-1",
          dayNumber: 1,
          time: "09:00",
          title: "檜意森活村",
          type: "attraction",
          transport: "步行",
          notes: "私人備註：訂位電話 05-123456",
          location: {
            name: "檜意森活村",
            lat: 23.48,
            lng: 120.45,
            description: "不應公開的描述",
            address: "嘉義市東區",
          },
          sourceUrl: "https://youtube.com/watch?v=secret",
          sourceSnippet: "snippet",
          sourceTitle: "來源標題",
          estimatedCost: 500,
        },
      ],
    },
  ],
  pins: [
    {
      id: "pin-1",
      name: "檜意森活村",
      lat: 23.48,
      lng: 120.45,
      description: "私人 pin 描述",
      phoneNumber: "05-123456",
      website: "https://example.com",
    },
  ],
};

test("buildPublicSnapshot strips private item and trip fields", () => {
  const snapshot = buildPublicSnapshot(samplePayload);
  assert.equal(snapshot.title, "嘉義兩日遊");
  assert.equal(snapshot.destination, "嘉義");
  assert.equal(snapshot.days, 2);
  const day = snapshot.itinerary[0];
  assert.ok(day);
  assert.equal("theme" in day, false);
  assert.equal("summary" in day, false);

  const item = day.items[0];
  assert.ok(item);
  assert.equal("notes" in item, false);
  assert.equal("sourceUrl" in item, false);
  assert.equal("estimatedCost" in item, false);
  assert.equal(item.location?.name, "檜意森活村");
  assert.equal("description" in (item.location ?? {}), false);
  assert.equal(snapshot.pins[0]?.description, "檜意森活村");
});

test("buildPublicationSearchText includes title destination and item names", () => {
  const snapshot = buildPublicSnapshot(samplePayload);
  const searchText = buildPublicationSearchText(snapshot);
  assert.match(searchText, /嘉義兩日遊/);
  assert.match(searchText, /嘉義/);
  assert.match(searchText, /檜意森活村/);
});

test("assertTripPublishable requires at least one day and one item", () => {
  assert.throws(() => assertTripPublishable({ ...samplePayload, itinerary: [] }), /validation_error/);
  assert.throws(
    () =>
      assertTripPublishable({
        ...samplePayload,
        itinerary: [{ dayNumber: 1, items: [] }],
      }),
    /validation_error/,
  );
  assert.doesNotThrow(() => assertTripPublishable(samplePayload));
});
