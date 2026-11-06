import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleMapsUrl, buildRoutePlanningUrl } from "./mapPinInfoShared";

test("OSM places open OSM directions without generating Google links", () => {
  for (const placeId of ["W:158995081", "photon:W:158995081", "overpass:node:123", "node/123"]) {
    const pin = { lat: 22.9972744, lng: 120.2027032, placeId };
    const route = new URL(buildRoutePlanningUrl(pin));
    assert.equal(route.host, "www.openstreetmap.org");
    assert.equal(route.searchParams.get("to"), `${pin.lat},${pin.lng}`);
    assert.equal(buildGoogleMapsUrl(pin), null);
  }
});

test("legacy Google place ids remain supported", () => {
  const pin = { lat: 25, lng: 121, placeId: "ChIJLegacy" };
  assert.equal(new URL(buildRoutePlanningUrl(pin)).searchParams.get("destination_place_id"), pin.placeId);
  assert.equal(new URL(buildGoogleMapsUrl(pin)!).searchParams.get("query_place_id"), pin.placeId);
});
