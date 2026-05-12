import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalPlaceSurfaceKey,
  dedupeRepeatedPlaceNamesInText,
  extractLikelyPlacePhrasesFromChinese,
  hasSynonymSurfaceConflict,
  poiSynonymGroupsForPrompt,
  surfaceFormsForPlaceDedupe,
} from "@/server/video/segmentPlaceDedupe";

test("canonicalPlaceSurfaceKey unifies 車站／駅 suffix", () => {
  assert.equal(canonicalPlaceSurfaceKey("熊本車站"), canonicalPlaceSurfaceKey("熊本站"));
  assert.equal(canonicalPlaceSurfaceKey("熊本駅"), canonicalPlaceSurfaceKey("熊本站"));
});

test("canonicalPlaceSurfaceKey strips JR prefix", () => {
  assert.equal(canonicalPlaceSurfaceKey("JR熊本站"), canonicalPlaceSurfaceKey("熊本車站"));
  assert.equal(canonicalPlaceSurfaceKey("JR熊本駅"), canonicalPlaceSurfaceKey("熊本站"));
});

test("surfaceFormsForPlaceDedupe yields 站／車站 variants", () => {
  const forms = surfaceFormsForPlaceDedupe("熊本站");
  assert.ok(forms.includes("熊本站"));
  assert.ok(forms.includes("熊本車站"));
});

test("surfaceFormsForPlaceDedupe adds JR-style variants for stations", () => {
  const forms = surfaceFormsForPlaceDedupe("熊本站");
  assert.ok(forms.some((f) => /^JR/u.test(f)));
  assert.ok(forms.includes("JR熊本站") || forms.includes("JR熊本車站"));
});

test("hasSynonymSurfaceConflict detects mixed station surfaces", () => {
  assert.equal(
    hasSynonymSurfaceConflict(["熊本站"], "先抵達熊本站再走路到熊本車站"),
    true,
  );
  assert.equal(hasSynonymSurfaceConflict(["熊本站"], "從熊本站搭電車"), false);
  assert.equal(hasSynonymSurfaceConflict(["熊本站"], "熊本站附近熊本站"), false);
});

test("poiSynonymGroupsForPrompt merges duplicate canonical hints and emits synonym arrays", () => {
  const groups = poiSynonymGroupsForPrompt(["熊本站", "熊本車站", "熊本城"]);
  assert.equal(groups.length, 2);
  const stationGroup = groups.find((g) => g.some((s) => s.includes("熊本") && s.includes("站")));
  assert.ok(stationGroup);
  assert.ok(stationGroup!.includes("熊本站"));
  assert.ok(stationGroup!.includes("熊本車站"));
  const castleGroup = groups.find((g) => g.some((s) => s === "熊本城"));
  assert.ok(castleGroup);
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

test("extractLikelyPlacePhrasesFromChinese finds major POI tails", () => {
  const sample = "走路去熊本城\n熊本櫻町巴士總站\n草千里\n黑亭";
  const phrases = extractLikelyPlacePhrasesFromChinese(sample);
  assert.ok(phrases.some((p) => canonicalPlaceSurfaceKey(p) === canonicalPlaceSurfaceKey("熊本城")));
  assert.ok(
    phrases.some((p) => canonicalPlaceSurfaceKey(p) === canonicalPlaceSurfaceKey("熊本櫻町巴士總站")),
  );
  assert.ok(phrases.some((p) => p.includes("草千里")));
  assert.ok(phrases.some((p) => p.includes("黑亭")));
});

test("dedupeRepeatedPlaceNamesInText collapses newline-heavy Kumamoto-style spam without hints", () => {
  const input = [
    "草千里",
    "黑亭",
    "熊本站",
    "從熊本車站",
    "直達熊本站",
    "它就在熊本車站",
    "可直達市區熊本站",
    "城的交通也十分簡單 從熊本車站",
    "走進對長輩極度友善的熊本城",
    "距離熊本櫻町巴士總站",
    "它位在熊本櫻町巴士總站",
    "走路去熊本城",
    "是體驗熊本城",
    "市的靈魂 熊本城",
    "熊本城",
    "最棒的是重建後的熊本城",
  ].join("\n");
  const out = dedupeRepeatedPlaceNamesInText(input, []);
  assert.ok(out.includes("草千里"));
  assert.ok(out.includes("黑亭"));
  assert.ok(out.includes("熊本櫻町巴士總站"));
  const kumamotoCastleHits = [...out.matchAll(/熊本城/g)].length;
  assert.ok(kumamotoCastleHits <= 2, `expected at most 2 熊本城 surfaces, got ${kumamotoCastleHits}`);
  assert.ok(!out.includes("從熊本車站"), "redundant station line should be removed or trimmed");
});
