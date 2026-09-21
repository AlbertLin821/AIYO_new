import assert from "node:assert/strict";
import test from "node:test";
import { loadMapRoute, mapRouteProfile } from "./mapRoutePresentation";
import { buildItineraryRouteSegments } from "./routeSegments";

const segment = buildItineraryRouteSegments([{ dayNumber: 1, items: [
  { id: "a", title: "台北車站", type: "attraction", time: "09:00", location: { name: "台北車站", lat: 25.0478, lng: 121.517 } },
  { id: "b", title: "中正紀念堂", type: "attraction", time: "10:00", transport: "Walking", location: { name: "中正紀念堂", lat: 25.0345, lng: 121.5218 } },
] }])[0];

test("transport profiles distinguish supported modes from transit and mixed travel", () => {
  for (const mode of ["Transit", "搭捷運後步行", "JR", "public_transport", "飛機", "ferry", "mixed", "未知"]) assert.equal(mapRouteProfile(mode), null);
  for (const mode of ["Walking", "步行", "走路"]) assert.equal(mapRouteProfile(mode), "walking");
  for (const mode of ["cycling", "Bicycling", "單車"]) assert.equal(mapRouteProfile(mode), "cycling");
  for (const mode of ["Driving", "self_drive", "自駕"]) assert.equal(mapRouteProfile(mode), "driving");
});

test("transit produces an honest schematic without requesting driving directions", async (t) => {
  const request = t.mock.method(globalThis, "fetch", async () => { throw new Error("Must not request"); });
  const result = await loadMapRoute({ ...segment, transport: "Transit" }, new AbortController().signal);
  assert.equal(request.mock.callCount(), 0);
  assert.equal(result.feature.properties.schematic, true);
  assert.equal(result.minutes, undefined);
});

test("verified road geometry and duration are returned to the map", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: unknown, options: RequestInit) => {
    assert.equal(JSON.parse(options.body as string).profile, "walking");
    return Response.json({ data: { route: { geometry: { type: "LineString", coordinates: [[121.517, 25.0478], [121.52, 25.04], [121.5218, 25.0345]] }, durationSeconds: 720 } } });
  });
  const result = await loadMapRoute(segment, new AbortController().signal);
  assert.equal(result.feature.properties.schematic, false);
  assert.equal(result.feature.geometry.coordinates.length, 3);
  assert.equal(result.minutes, 12);
});

test("provider failures fall back without advertising estimated time as routed time", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "unavailable" }, { status: 503 }));
  const result = await loadMapRoute(segment, new AbortController().signal);
  assert.equal(result.feature.properties.schematic, true);
  assert.equal(result.minutes, undefined);
});

test("cancelled itinerary requests cannot produce stale fallback geometry", async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, "fetch", async () => { controller.abort(); throw new Error("aborted"); });
  await assert.rejects(loadMapRoute(segment, controller.signal), /aborted/);
});
