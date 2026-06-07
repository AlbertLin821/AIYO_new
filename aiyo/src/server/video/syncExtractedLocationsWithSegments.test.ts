import assert from "node:assert/strict";
import test from "node:test";
import { locationReferencesIncludeName } from "@/lib/locationNameMatch";
import { syncExtractedLocationsWithSegments } from "@/server/video/syncExtractedLocationsWithSegments";
import type { LocationReference, VideoSummarySegment } from "@/types";

const mapReadyKumamotoCastle: LocationReference = {
  name: "熊本城",
  lat: 32.8062,
  lng: 130.7059,
  description: "熊本城，影片中提到的地點。",
  verified: true,
  resolvedFrom: "google-geocode",
};

test("syncExtractedLocationsWithSegments adds unverified row when segment hint misses map-ready pass", async () => {
  const segments: VideoSummarySegment[] = [
    {
      id: "seg_1",
      timestamp: "1:00",
      title: "隱藏秘境小店",
      text: "影片提到隱藏秘境小店",
      summary: "影片提到隱藏秘境小店",
      locationHints: ["隱藏秘境小店"],
    },
  ];

  const synced = await syncExtractedLocationsWithSegments({
    segments,
    mapReadyLocations: [mapReadyKumamotoCastle],
  });

  assert.equal(synced.length, 2);
  assert.ok(locationReferencesIncludeName(synced, "熊本城"));
  assert.ok(locationReferencesIncludeName(synced, "隱藏秘境小店"));

  const unmapped = synced.find((loc) => loc.name === "隱藏秘境小店");
  assert.ok(unmapped);
  assert.equal(unmapped.verified, false);
  assert.ok(!Number.isFinite(unmapped.lat));
  assert.ok(!Number.isFinite(unmapped.lng));
  assert.equal(unmapped.geocodeRejectedReason, "segment-hint-no-geocode");
});

test("syncExtractedLocationsWithSegments does not duplicate names already in map-ready list", async () => {
  const segments: VideoSummarySegment[] = [
    {
      id: "seg_1",
      timestamp: "0:30",
      title: "熊本城",
      text: "參觀熊本城",
      locationHints: ["熊本城"],
    },
  ];

  const synced = await syncExtractedLocationsWithSegments({
    segments,
    mapReadyLocations: [mapReadyKumamotoCastle],
  });

  assert.equal(synced.length, 1);
  assert.equal(synced[0]?.name, "熊本城");
});
