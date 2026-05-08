import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPlaceCandidates,
  extractPlacesFromTranscriptAndSummary,
  isGenericDestinationName,
  mergeAndDedupeExtractions,
} from "@/server/geo/extractLocations";

const chiayiTranscript = [
  "今天來到嘉義，不是只做嘉義美食整理，第一站是阿宏師火雞肉飯，雞油香氣很明顯。",
  "接著到東市場找在地早餐，市場裡有很多攤販，但我們只推薦剛剛提到的店。",
  "午餐吃林聰明砂鍋魚頭，這段會介紹湯頭和排隊方式。",
  "傍晚走到文化路夜市，最後再去嘉義公園散步，看射日塔夜景。",
];

test("generic destination names are filtered from travel-video location candidates", () => {
  assert.equal(isGenericDestinationName("嘉義", "嘉義"), true);
  assert.equal(isGenericDestinationName("嘉義市"), true);
  assert.equal(isGenericDestinationName("嘉義美食"), true);
  assert.equal(isGenericDestinationName("台南景點"), true);
  assert.equal(isGenericDestinationName("阿宏師火雞肉飯", "嘉義"), false);
});

test("Chiayi transcript extraction prefers concrete POIs and foods over broad city phrases", () => {
  const rawCandidates = chiayiTranscript.flatMap((line) => extractPlaceCandidates(line));
  const merged = mergeAndDedupeExtractions(rawCandidates, "嘉義").map((entry) => entry.displayName);

  assert.ok(merged.includes("阿宏師火雞肉飯"));
  assert.ok(merged.includes("林聰明砂鍋魚頭"));
  assert.ok(merged.includes("文化路夜市"));
  assert.ok(merged.includes("嘉義公園"));
  assert.ok(!merged.includes("嘉義"));
  assert.ok(!merged.includes("嘉義市"));
  assert.ok(!merged.includes("嘉義美食"));
});

test("hybrid transcript extraction does not invent locations outside the transcript", () => {
  const extracted = extractPlacesFromTranscriptAndSummary({
    summary: "嘉義小吃與夜市動線整理。",
    segmentTexts: [
      "阿宏師火雞肉飯介紹雞油與肉片。",
      "林聰明砂鍋魚頭介紹湯頭。",
      "文化路夜市適合晚餐後散步。",
    ],
    transcriptTexts: chiayiTranscript,
    llmLocationNames: ["嘉義", "嘉義市", "嘉義美食", "阿宏師火雞肉飯", "林聰明砂鍋魚頭", "文化路夜市"],
    destinationHint: "嘉義",
    videoTitle: "嘉義美食一日遊",
  }).map((candidate) => candidate.extraction.displayName);

  assert.ok(extracted.includes("阿宏師火雞肉飯"));
  assert.ok(extracted.includes("林聰明砂鍋魚頭"));
  assert.ok(extracted.includes("文化路夜市"));
  assert.ok(!extracted.includes("嘉義"));
  assert.ok(!extracted.includes("嘉義市"));
  assert.ok(!extracted.includes("嘉義美食"));
  assert.ok(!extracted.includes("東京鐵塔"));
});

