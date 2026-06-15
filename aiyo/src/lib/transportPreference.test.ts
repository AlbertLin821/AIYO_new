import assert from "node:assert/strict";
import test from "node:test";
import {
  inferPlanningTransportPreference,
  inferTransportModeForDistance,
  normalizePlanningTransportPreference,
  resolvePlanningTransportPreference,
  transportPreferenceToSegmentMode,
} from "@/lib/transportPreference";

test("resolvePlanningTransportPreference falls back to destination-friendly default", () => {
  assert.equal(resolvePlanningTransportPreference(null, "澎湖"), "self_drive");
  assert.equal(resolvePlanningTransportPreference(undefined, "東京"), "public_transport");
});

test("normalizePlanningTransportPreference accepts stored and localized values", () => {
  assert.equal(normalizePlanningTransportPreference("Transit"), "public_transport");
  assert.equal(normalizePlanningTransportPreference("自駕"), "self_drive");
  assert.equal(normalizePlanningTransportPreference("Walking"), "walking");
});

test("transportPreferenceToSegmentMode chooses regional transit labels", () => {
  assert.equal(transportPreferenceToSegmentMode("public_transport", "東京"), "Transit (Metro)");
  assert.equal(transportPreferenceToSegmentMode("public_transport", "台北"), "Transit (MRT)");
  assert.equal(transportPreferenceToSegmentMode("self_drive", "澎湖"), "Driving");
});

test("inferTransportModeForDistance prefers walking for short hops without explicit preference", () => {
  assert.equal(inferTransportModeForDistance({ destination: "台北", distanceKm: 0.8 }), "Walking");
  assert.equal(inferTransportModeForDistance({ destination: "澎湖", distanceKm: 5.2 }), "Driving");
  assert.equal(
    inferTransportModeForDistance({
      destination: "大阪",
      preferredTransport: "public_transport",
      distanceKm: 0.6,
    }),
    "Transit (Metro)",
  );
});

test("inferPlanningTransportPreference detects driving-friendly island destinations", () => {
  assert.equal(inferPlanningTransportPreference("澎湖"), "self_drive");
  assert.equal(inferPlanningTransportPreference("北海道"), "self_drive");
  assert.equal(inferPlanningTransportPreference("首爾"), "public_transport");
});
