import assert from "node:assert/strict";
import test from "node:test";
import { cleanPlaceMentionName } from "@/server/video/placeMentionNormalizer";
import { buildDescriptionFallbackTranscriptEntries } from "@/server/services/videoSummaryService";
import { extractTimestampAwarePlaceMentions } from "@/server/video/placeMentionExtractor";
import { preprocessTranscript } from "@/server/video/transcriptProcessing";
import { taiwanProfile } from "@/server/video/travelExtractionProfiles";

function clean(value: string) {
  return cleanPlaceMentionName(value, taiwanProfile, "嘉義市");
}

test("cleanPlaceMentionName removes spoken prefixes and conjunctions", () => {
  assert.equal(clean("晚上來到文化路夜市").cleanedName, "文化路夜市");
  assert.equal(clean("接著來到旺來山鳳梨文化園區").cleanedName, "旺來山鳳梨文化園區");
  assert.equal(clean("及郭家火雞肉飯").cleanedName, "郭家火雞肉飯");
  assert.equal(clean("然後去檜意森活村").cleanedName, "檜意森活村");
});

test("cleanPlaceMentionName rejects generic sentence fragments", () => {
  assert.equal(clean("走路就能逛夜市").rejectedReason, "sentence-only-generic-phrase");
  assert.ok(clean("等晚上回飯店").rejectedReason);
  assert.equal(clean("這邊附近很多美食").rejectedReason, "sentence-only-generic-phrase");
});

test("extractTimestampAwarePlaceMentions keeps store names but drops generic fragments", () => {
  const lines = preprocessTranscript(
    [
      { timestamp: "00:10", startSeconds: 10, durationSeconds: 4, text: "晚上來到文化路夜市，接著吃及郭家火雞肉飯。" },
      { timestamp: "00:20", startSeconds: 20, durationSeconds: 4, text: "走路就能逛夜市，等晚上回飯店。" },
      { timestamp: "00:30", startSeconds: 30, durationSeconds: 4, text: "民主火雞肉飯、林聰明砂鍋魚頭、北門驛都很適合安排。" },
    ],
    taiwanProfile,
  );
  const mentions = extractTimestampAwarePlaceMentions({
    lines,
    profile: taiwanProfile,
    destinationHint: "嘉義市",
  });
  const names = mentions.map((mention) => mention.name);
  assert.ok(names.includes("文化路夜市"));
  assert.ok(names.includes("郭家火雞肉飯"));
  assert.ok(names.includes("民主火雞肉飯"));
  assert.ok(names.includes("林聰明砂鍋魚頭"));
  assert.ok(names.includes("北門驛"));
  assert.ok(!names.includes("走路就能逛夜市"));
  assert.ok(!names.includes("等晚上回飯店"));
});

test("description fallback entries are sentence-split and low-confidence", () => {
  const entries = buildDescriptionFallbackTranscriptEntries({
    title: "嘉義兩天一夜",
    description: "📍文化路夜市攻略。📍郭家火雞肉飯必吃。\n\n請記得訂閱我的頻道",
  });
  assert.ok(entries.length >= 2);
  assert.ok(entries.every((entry) => entry.timestampSource === "description-fallback"));
  assert.ok(entries.every((entry) => entry.timestampConfidence === "low"));
  assert.ok(entries.every((entry) => !entry.text.includes("請記得訂閱")));
});
