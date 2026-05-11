import assert from "node:assert/strict";
import test from "node:test";
import { evaluateGeocodeConfidenceGate } from "@/server/geo/geocodeService";

test("geocode gate rejects city-level result even with coordinates and placeId", () => {
  const gate = evaluateGeocodeConfidenceGate({
    rawMention: "接著來到旺來山鳳梨文化園區",
    cleanedName: "旺來山鳳梨文化園區",
    formattedAddress: "Chiayi City, Taiwan 600",
    types: ["locality", "political"],
    placeId: "city-place-id",
    baseConfidence: 0.72,
  });
  assert.equal(gate.accepted, false);
  assert.equal(gate.rejectedReason, "city-level-geocode-result");
});

test("geocode gate accepts specific POI-like restaurant match", () => {
  const gate = evaluateGeocodeConfidenceGate({
    rawMention: "及郭家火雞肉飯",
    cleanedName: "郭家火雞肉飯",
    formattedAddress: "No. 148, Wenhua Rd, East District, Chiayi City, Taiwan 600",
    resultName: "郭家雞肉飯",
    types: ["restaurant", "food", "point_of_interest", "establishment"],
    placeId: "poi-place-id",
    baseConfidence: 0.72,
  });
  assert.equal(gate.accepted, true);
  assert.ok(gate.confidence >= 0.52);
  assert.match(gate.matchReason, /preferredType=true/);
});
