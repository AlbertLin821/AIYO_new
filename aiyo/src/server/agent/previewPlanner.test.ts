import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PersistedTripPayload } from "@/types";
import { planAgentPreview, type VerifiedAgentPlace } from "./previewPlanner";

const base: PersistedTripPayload = {
  tripId: "trip-1", revision: 3, title: "東京", destination: "東京", days: 2,
  itinerary: [
    { dayNumber: 1, items: [{ id: "one", time: "09:00", title: "淺草寺", type: "activity", source: "manual" }] },
    { dayNumber: 2, items: [{ id: "two", time: "10:00", title: "東京晴空塔", type: "activity", source: "manual" }] },
  ],
  pins: [], updatedAt: "2026-11-06T00:00:00.000Z",
};
const verified: VerifiedAgentPlace = {
  id: "photon:123", title: "東京國立博物館",
  location: { name: "東京國立博物館", lat: 35.7188, lng: 139.7765, description: "", resolvedFrom: "photon", verified: true },
};

describe("agent preview planner", () => {
  it("moves an existing item without changing the original snapshot", () => {
    const result = planAgentPreview(base, { version: 1, explanation: "移到第二天", operations: [{ type: "move_item", itemId: "one", toDay: 2, afterItemId: null }] }, new Map());
    assert.deepEqual(result.trip.itinerary[1].items.map((item) => item.id), ["one", "two"]);
    assert.equal(result.trip.itinerary[1].items[0].dayNumber, 2);
    assert.deepEqual(base.itinerary[0].items.map((item) => item.id), ["one"]);
  });

  it("adds a verified place with a linked map pin", () => {
    const result = planAgentPreview(base, { version: 1, explanation: "增加室內景點", operations: [{ type: "add_item", day: 2, placeId: verified.id, time: "14:00", afterItemId: "two" }] }, new Map([[verified.id, verified]]));
    const item = result.trip.itinerary[1].items[1];
    assert.equal(item.title, verified.title);
    assert.equal(item.time, "14:00");
    assert.ok(result.trip.pins.some((pin) => pin.linkedTripItemId === item.id));
    assert.ok(result.warnings.some((warning) => warning.includes("營業時間待確認")));
  });

  it("rejects unverified places and foreign item ids", () => {
    assert.throws(() => planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "add_item", day: 2, placeId: "fake", time: "14:00", afterItemId: null }] }, new Map()), /unverified_place/);
    assert.throws(() => planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "remove_item", itemId: "foreign" }] }, new Map()), /item_not_found/);
  });

  it("rejects a new place at the same start time as another item that day", () => {
    assert.throws(() => planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "add_item", day: 1, placeId: verified.id, time: "09:00", afterItemId: "one" }] }, new Map([[verified.id, verified]])), /schedule_conflict/);
    assert.throws(() => planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "replace_item", itemId: "one", placeId: verified.id, time: "10:00" }, { type: "add_item", day: 1, placeId: verified.id, time: "10:00", afterItemId: "one" }] }, new Map([[verified.id, verified]])), /schedule_conflict/);
  });

  it("rejects insertion, replacement, or movement that reverses the day's time order", () => {
    const places = new Map([[verified.id, verified]]);
    assert.throws(() => planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "add_item", day: 1, placeId: verified.id, time: "14:00", afterItemId: null }] }, places), /schedule_conflict/);
    const withTwoStops: PersistedTripPayload = {
      ...base,
      itinerary: [{ dayNumber: 1, items: [
        { id: "one", time: "09:00", title: "淺草寺", type: "activity" },
        { id: "later", time: "12:00", title: "午餐", type: "meal" },
      ] }, ...base.itinerary.slice(1)],
    };
    assert.throws(() => planAgentPreview(withTwoStops, { version: 1, explanation: "", operations: [{ type: "replace_item", itemId: "one", placeId: verified.id, time: "13:00" }] }, places), /schedule_conflict/);
    assert.throws(() => planAgentPreview(withTwoStops, { version: 1, explanation: "", operations: [{ type: "move_item", itemId: "later", toDay: 1, afterItemId: null }] }, places), /schedule_conflict/);
    const reordered = planAgentPreview(withTwoStops, { version: 1, explanation: "", operations: [{ type: "move_item", itemId: "later", toDay: 1, afterItemId: null, time: "08:30" }] }, places);
    assert.deepEqual(reordered.trip.itinerary[0].items.map((item) => [item.id, item.time]), [["later", "08:30"], ["one", "09:00"]]);
  });

  it("clears route estimates when a changed place invalidates its leg and the following leg", () => {
    const withRoutes: PersistedTripPayload = {
      ...base,
      itinerary: [{ dayNumber: 1, items: [
        { id: "one", time: "09:00", title: "淺草寺", type: "activity", location: { name: "淺草寺", lat: 35.7147, lng: 139.7967, description: "", verified: true } },
        { id: "middle", time: "11:00", title: "上野", type: "activity", location: { name: "上野", lat: 35.71, lng: 139.77, description: "", verified: true }, transportDurationMinutes: 12, transportDistanceMeters: 2000, transportDataSource: "osrm" },
        { id: "last", time: "14:00", title: "秋葉原", type: "activity", location: { name: "秋葉原", lat: 35.6984, lng: 139.7731, description: "", verified: true }, transportDurationMinutes: 15, transportDistanceMeters: 2300, transportDataSource: "osrm" },
      ] }, ...base.itinerary.slice(1)],
    };
    const result = planAgentPreview(withRoutes, { version: 1, explanation: "換地點", operations: [{ type: "replace_item", itemId: "middle", placeId: verified.id, time: "11:00" }] }, new Map([[verified.id, verified]]));
    assert.equal(result.trip.itinerary[0].items[1].transportDurationMinutes, undefined);
    assert.equal(result.trip.itinerary[0].items[2].transportDurationMinutes, undefined);
    assert.equal(withRoutes.itinerary[0].items[1].transportDurationMinutes, 12);
    assert.ok(result.warnings.some((warning) => warning.includes("交通時間估算已清除")));
  });

  it("rejects a verified place outside fixed daily hours and warns before closing", () => {
    const daily = { ...verified, location: { ...verified.location, openingHours: "Mo-Su 09:00-17:00" } };
    const places = new Map([[daily.id, daily]]);
    assert.throws(() => planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "add_item", day: 2, placeId: daily.id, time: "18:00", afterItemId: "two" }] }, places), /opening_hours_conflict/);
    const preview = planAgentPreview(base, { version: 1, explanation: "", operations: [{ type: "add_item", day: 2, placeId: daily.id, time: "16:45", afterItemId: "two" }] }, places);
    assert.ok(preview.warnings.some((warning) => warning.includes("停留時間待確認")));
  });

  it("uses the saved departure date for weekday opening hours", () => {
    const dated = { ...base, startDate: "2026-11-06" };
    const weekday = { ...verified, location: { ...verified.location, openingHours: "Mo-Fr 09:00-17:00" } };
    const places = new Map([[weekday.id, weekday]]);
    const operation = { version: 1 as const, explanation: "", operations: [{ type: "add_item" as const, day: 2, placeId: weekday.id, time: "14:00", afterItemId: "two" }] };
    assert.throws(() => planAgentPreview(dated, operation, places), /opening_hours_conflict/);
    const unknown = planAgentPreview(base, operation, places);
    assert.ok(unknown.warnings.some((warning) => warning.includes("營業時間待確認")));
  });
});
