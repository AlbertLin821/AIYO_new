import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanRoutingPhraseToPlaceName,
  isLikelyTranscriptFragment,
  validatePoiNameQuality,
} from "@/server/video/placeExtraction/placeNameQualityGate";

test("cleanRoutingPhraseToPlaceName strips routing and commentary wrappers", () => {
  assert.equal(cleanRoutingPhraseToPlaceName("從熊本車站"), "熊本車站");
  assert.equal(cleanRoutingPhraseToPlaceName("直達熊本站"), "熊本站");
  assert.equal(cleanRoutingPhraseToPlaceName("它就在熊本車站"), "熊本車站");
  assert.equal(cleanRoutingPhraseToPlaceName("走路去熊本城"), "熊本城");
  assert.equal(cleanRoutingPhraseToPlaceName("最棒的是重建後的熊本城"), "熊本城");
});

test("validatePoiNameQuality rejects fragments, generic locations, and pure foods", () => {
  assert.equal(validatePoiNameQuality("城的交通也十分簡單 從熊本車").accepted, false);
  assert.equal(validatePoiNameQuality("附近").accepted, false);
  assert.equal(validatePoiNameQuality("大阪", { destinationHint: "大阪" }).accepted, false);
  assert.equal(validatePoiNameQuality("火雞肉飯").accepted, false);
});

test("validatePoiNameQuality keeps concrete names across languages", () => {
  assert.equal(validatePoiNameQuality("嘉義文化路夜市").cleanedName, "嘉義文化路夜市");
  assert.equal(validatePoiNameQuality("推薦郭家火雞肉飯").cleanedName, "郭家火雞肉飯");
  assert.equal(validatePoiNameQuality("We start from Shibuya Station.").cleanedName, "Shibuya Station");
  assert.equal(validatePoiNameQuality("從弘大入口站出發").cleanedName, "弘大入口站");
});

test("isLikelyTranscriptFragment identifies sentence-like phrases", () => {
  assert.equal(isLikelyTranscriptFragment("This area is very busy"), true);
  assert.equal(isLikelyTranscriptFragment("Shibuya Crossing"), false);
  assert.equal(isLikelyTranscriptFragment("接著我們走路去附近"), true);
});
