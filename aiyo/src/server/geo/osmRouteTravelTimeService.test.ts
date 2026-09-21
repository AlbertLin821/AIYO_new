import assert from "node:assert/strict";
import test from "node:test";
import { mapService } from "@/server/maps/service";
import { enrichTripPlanWithRouteTravelTimes } from "./osmRouteTravelTimeService";
import type { TripPlanResult } from "@/types";

test("route enrichment never substitutes driving time for public transport", async (t) => {
  const request = t.mock.method(mapService, "getRoute", async (_points, profile) => {
    assert.equal(profile, "walking");
    return { durationSeconds: 600, distanceMeters: 700, geometry: { type: "LineString" as const, coordinates: [] } };
  });
  const plan: TripPlanResult = { summary: "東京", days: [{ dayNumber: 1, items: [
    { id: "a", title: "淺草寺", time: "09:00", type: "attraction", location: { name: "淺草寺", lat: 35.7148, lng: 139.7967 } },
    { id: "b", title: "東京晴空塔", time: "11:00", type: "attraction", transport: "Transit", location: { name: "東京晴空塔", lat: 35.71, lng: 139.81 } },
    { id: "c", title: "隅田公園", time: "14:00", type: "attraction", transport: "Walking", location: { name: "隅田公園", lat: 35.715, lng: 139.801 } },
  ] }] };
  const result = await enrichTripPlanWithRouteTravelTimes(plan);
  assert.equal(request.mock.callCount(), 1);
  assert.equal(result.days[0].items[1].transportDataSource, undefined);
  assert.equal(result.days[0].items[1].transportDurationMinutes, undefined);
  assert.equal(result.days[0].items[2].transportDurationMinutes, 10);
  assert.equal(result.days[0].items[2].transportDataSource, "osrm");
});
