import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PersistedTripPayload } from "@/types";
import { planAgentPreview } from "./previewPlanner";
import { validatePreviewTravel } from "./previewTravelValidation";

const trip: PersistedTripPayload = {
  tripId: "trip", revision: 0, title: "東京", destination: "東京", days: 1, updatedAt: "2026-11-06T00:00:00Z", pins: [],
  itinerary: [{ dayNumber: 1, items: [
    { id: "a", time: "09:00", title: "淺草寺", type: "activity", location: { name: "淺草寺", lat: 35.7147, lng: 139.7967, description: "", verified: true } },
    { id: "b", time: "10:00", title: "晴空塔", type: "activity", transport: "步行", location: { name: "晴空塔", lat: 35.7101, lng: 139.8107, description: "", verified: true }, transportDurationMinutes: 20, transportDataSource: "osrm" },
  ] }],
};

describe("agent preview travel validation", () => {
  const place = { id: "museum", title: "博物館", location: { name: "博物館", lat: 35.72, lng: 139.78, description: "", verified: true } };
  const proposal = { version: 1 as const, explanation: "替換地點", operations: [{ type: "replace_item" as const, itemId: "b", placeId: place.id, time: "10:00" }] };

  it("rechecks the changed walking leg and rejects an impossible start time", async () => {
    const preview = planAgentPreview(trip, proposal, new Map([[place.id, place]]));
    await assert.rejects(() => validatePreviewTravel(trip, preview, async () => ({ durationSeconds: 70 * 60, distanceMeters: 3500, geometry: { type: "LineString", coordinates: [[139.7967, 35.7147], [139.78, 35.72]] } })), /travel_time_conflict/);
  });

  it("stores a fresh route estimate and warns when the buffer is short", async () => {
    const preview = planAgentPreview(trip, proposal, new Map([[place.id, place]]));
    const result = await validatePreviewTravel(trip, preview, async () => ({ durationSeconds: 55 * 60, distanceMeters: 3200, geometry: { type: "LineString", coordinates: [[139.7967, 35.7147], [139.78, 35.72]] } }));
    assert.equal(result.trip.itinerary[0].items[1].transportDurationMinutes, 55);
    assert.equal(result.changes[0].after?.transportDataSource, "osrm");
    assert.ok(result.warnings.some((warning) => warning.includes("交通緩衝不足")));
    assert.equal(trip.itinerary[0].items[1].transportDurationMinutes, 20);
  });

  it("keeps the preview usable with an explicit warning when routing fails", async () => {
    const preview = planAgentPreview(trip, proposal, new Map([[place.id, place]]));
    const result = await validatePreviewTravel(trip, preview, async () => { throw new Error("offline"); });
    assert.equal(result.trip.itinerary[0].items[1].transportDurationMinutes, undefined);
    assert.ok(result.warnings.some((warning) => warning.includes("交通時間待確認")));
  });

  it("does not reject an unrelated edit because an existing leg was already too tight", async () => {
    const withOldConflict: PersistedTripPayload = {
      ...trip,
      itinerary: [{ ...trip.itinerary[0], items: trip.itinerary[0].items.map((item) => item.id === "b" ? { ...item, transportDurationMinutes: 90 } : item) },
        { dayNumber: 2, items: [{ id: "c", time: "14:00", title: "上野", type: "activity" }] }],
      days: 2,
    };
    const preview = planAgentPreview(withOldConflict, { version: 1, explanation: "移到隔天", operations: [{ type: "move_item", itemId: "c", toDay: 2, afterItemId: null, time: "13:00" }] }, new Map());
    const result = await validatePreviewTravel(withOldConflict, preview, async () => { throw new Error("unexpected route lookup"); });
    assert.equal(result.trip.itinerary[0].items[1].transportDurationMinutes, 90);
  });
});
