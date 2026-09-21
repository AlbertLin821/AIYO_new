import assert from "node:assert/strict";
import test from "node:test";
import { createVideoPlaceResolver } from "../videoPlaceResolver";
import { syncExtractedLocationsWithSegments } from "../syncExtractedLocationsWithSegments";
import type { GeocodePlaceResult } from "@/server/places/geocodePlace";

const missing: GeocodePlaceResult = { ok: false, code: "not_found", message: "找不到地點" };

test("concurrent requests and later sync reuse failures without another provider call", async () => {
  let calls = 0;
  const resolvePlace = createVideoPlaceResolver({ destinationHint: "東京" }, async () => {
    calls += 1;
    return missing;
  });
  await Promise.all([resolvePlace("Unknown Place"), resolvePlace("  unknown   place  ")]);
  const locations = await syncExtractedLocationsWithSegments({
    destinationHint: "東京", resolvePlace, mapReadyLocations: [],
    segments: [{ id: "s1", timestamp: "00:10", text: "Unknown Place", locationHints: ["Unknown Place"] }],
  });
  assert.equal(calls, 1);
  assert.equal(locations.length, 1);
  assert.equal(locations[0].verified, false);
  assert.equal(Number.isFinite(locations[0].lat), false);
});

test("limits active requests to two and releases capacity after a provider failure", async () => {
  const releases: Array<() => void> = [];
  let active = 0;
  let maximum = 0;
  const started: string[] = [];
  const resolvePlace = createVideoPlaceResolver({}, async ({ query }) => {
    active += 1;
    maximum = Math.max(maximum, active);
    started.push(query);
    await new Promise<void>((resolve) => releases.push(resolve));
    active -= 1;
    if (query === "bad") throw new Error("provider failed");
    return missing;
  });
  const requests = ["bad", "second", "third", "fourth"].map(resolvePlace);
  assert.deepEqual(started, ["bad", "second"]);
  releases.shift()!();
  assert.equal((await requests[0]).ok, false);
  assert.deepEqual(started, ["bad", "second", "third"]);
  releases.shift()!();
  await requests[1];
  releases.splice(0).forEach((release) => release());
  assert.equal((await Promise.all(requests)).length, 4);
  assert.equal(maximum, 2);
});

test("separate analyses do not reuse results from another destination", async () => {
  const destinations: Array<string | undefined> = [];
  const geocode = async (input: { destinationHint?: string }) => {
    destinations.push(input.destinationHint);
    return missing;
  };
  await createVideoPlaceResolver({ destinationHint: "東京" }, geocode)("中央公園");
  await createVideoPlaceResolver({ destinationHint: "紐約" }, geocode)("中央公園");
  assert.deepEqual(destinations, ["東京", "紐約"]);
});

test("sync preserves other results when one lookup throws", async () => {
  const locations = await syncExtractedLocationsWithSegments({
    destinationHint: "東京", mapReadyLocations: [],
    segments: [{ id: "s", timestamp: "00:10", text: "places", locationHints: ["Broken Place", "Good Place"] }],
    resolvePlace: async (query) => {
      if (query === "Broken Place") throw new Error("outage");
      return { ok: true, place: { placeName: query, lat: 35.68, lng: 139.76, provider: "photon" } };
    },
  });
  assert.deepEqual(locations.map((place) => place.name), ["Broken Place", "Good Place"]);
  assert.equal(locations[0].verified, false);
  assert.equal(locations[1].verified, true);
});
