import assert from "node:assert/strict";
import test from "node:test";
import { mapService } from "@/server/maps/service";
import { normalizePhotonFeature } from "@/server/maps/providers/photon";
import { rankPlaceCandidates } from "@/server/personalization/placePreferenceRanking";
import { searchPlacesByText } from "./osmPlacesSearchService";

test("Photon categories survive map adapter and drive preference ranking and exclusion", async (t) => {
  const rows = [
    { name: "National Collection", osm_key: "tourism", osm_value: "museum" },
    { name: "Blue Bottle", osm_key: "amenity", osm_value: "cafe" },
    { name: "Green Space", osm_key: "leisure", osm_value: "park" },
  ].map((properties, index) => normalizePhotonFeature({
    geometry: { coordinates: [139.7, 35.7] }, properties: { ...properties, osm_id: index },
  })!);
  t.mock.method(mapService, "searchPlaces", async () => rows);
  const result = await searchPlacesByText("東京", undefined);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.places.map((place) => place.types), [["museum"], ["cafe"], ["park"]]);
  assert.deepEqual(rankPlaceCandidates(result.places, { interests: ["美食"], avoid: ["博物館"] }).map((place) => place.name), ["Blue Bottle", "Green Space"]);
  assert.deepEqual(rankPlaceCandidates(result.places, { interests: ["自然"] }).map((place) => place.name), ["Green Space", "National Collection", "Blue Bottle"]);
});

test("unknown or mismatched OSM classification remains unknown despite query and venue name", async (t) => {
  const rows = [
    { name: "Cafe Museum", osm_key: "building", osm_value: "museum" },
    { name: "Unknown", osm_key: "tourism", osm_value: "unknown" },
    { name: "Untyped" },
  ].map((properties) => normalizePhotonFeature({ geometry: { coordinates: [139.7, 35.7] }, properties })!);
  t.mock.method(mapService, "searchPlaces", async () => rows);
  const result = await searchPlacesByText("東京 餐廳 博物館");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.places.map((place) => place.types), [[], [], []]);
  assert.deepEqual(rankPlaceCandidates(result.places, { avoid: ["美食"] }), result.places);
});
