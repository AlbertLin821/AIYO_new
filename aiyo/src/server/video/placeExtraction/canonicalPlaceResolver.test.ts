import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizePlaceName } from "@/server/video/placeExtraction/canonicalPlaceResolver";

test("canonicalizePlaceName merges station variants", () => {
  assert.equal(canonicalizePlaceName("熊本站").canonicalName, "熊本車站");
  assert.equal(canonicalizePlaceName("熊本駅").canonicalName, "熊本車站");
  assert.equal(canonicalizePlaceName("JR熊本站").canonicalName, "熊本車站");
});

test("canonicalizePlaceName normalizes traditional variants and aliases", () => {
  assert.equal(canonicalizePlaceName("櫻町巴士總站").canonicalName, "熊本櫻町巴士總站");
  assert.equal(canonicalizePlaceName("臺北").canonicalName, "台北");
  assert.equal(canonicalizePlaceName("Shibuya Station").canonicalName, "Shibuya Station");
});
