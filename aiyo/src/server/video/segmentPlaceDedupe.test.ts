import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalPlaceSurfaceKey,
  dedupeRepeatedPlaceNamesInText,
  surfaceFormsForPlaceDedupe,
} from "@/server/video/segmentPlaceDedupe";

test("canonicalPlaceSurfaceKey unifies 車站／駅 suffix", () => {
  assert.equal(canonicalPlaceSurfaceKey("熊本車站"), canonicalPlaceSurfaceKey("熊本站"));
  assert.equal(canonicalPlaceSurfaceKey("熊本駅"), canonicalPlaceSurfaceKey("熊本站"));
});

test("surfaceFormsForPlaceDedupe yields 站／車站 variants", () => {
  const forms = surfaceFormsForPlaceDedupe("熊本站");
  assert.ok(forms.includes("熊本站"));
  assert.ok(forms.includes("熊本車站"));
});

test("dedupeRepeatedPlaceNamesInText keeps first mention and drops synonyms", () => {
  const input = ["熊本站", "從熊本車站", "直達熊本站", "它就在熊本車站", "可直達市區熊本站"].join("\n");
  const out = dedupeRepeatedPlaceNamesInText(input, ["熊本站"]);
  assert.match(out, /熊本/);
  assert.ok(!out.includes("熊本車站"), "later 車站 variant should be removed");
  const stationHits = [...out.matchAll(/熊本站/g)].length;
  assert.equal(stationHits, 1, "only one 熊本站 surface form remains");
});

test("dedupeRepeatedPlaceNamesInText keeps distinct POIs", () => {
  const input = "先逛熊本城，再搭車到熊本站";
  const out = dedupeRepeatedPlaceNamesInText(input, ["熊本城", "熊本站"]);
  assert.ok(out.includes("熊本城"));
  assert.ok(out.includes("熊本站"));
});
