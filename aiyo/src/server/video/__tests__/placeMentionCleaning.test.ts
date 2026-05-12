import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanPlaceMentionName,
  dedupePlaceMentions,
  fuzzyDedupePlaceMentions,
  shouldExcludeAsPoiTitle,
} from "@/server/video/placeMentionNormalizer";
import { buildDescriptionFallbackTranscriptEntries } from "@/server/services/videoSummaryService";
import { extractTimestampAwarePlaceMentions } from "@/server/video/placeMentionExtractor";
import { preprocessTranscript } from "@/server/video/transcriptProcessing";
import {
  japanProfile,
  selectTravelExtractionProfile,
  taiwanProfile,
} from "@/server/video/travelExtractionProfiles";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";

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

test("cleanPlaceMentionName rejects extremely long subtitle-like fragments", () => {
  const longSynthetic = `文化路${"子".repeat(50)}`;
  const result = clean(longSynthetic);
  assert.equal(result.cleanedName, "");
  assert.equal(result.rejectedReason, "name-too-long");
});

test("extractTimestampAwarePlaceMentions drops search-style generic labels", () => {
  const lines = preprocessTranscript(
    [
      {
        timestamp: "00:10",
        startSeconds: 10,
        durationSeconds: 4,
        text: "嘉義美食攻略與台南景點推薦先看文化路夜市。",
      },
    ],
    taiwanProfile,
  );
  const mentions = extractTimestampAwarePlaceMentions({
    lines,
    profile: taiwanProfile,
    destinationHint: "嘉義市",
  });
  const names = mentions.map((m) => m.name);
  assert.ok(names.includes("文化路夜市"));
  assert.ok(!names.includes("嘉義美食"));
  assert.ok(!names.some((n) => n.includes("台南景點")));
});

test("cleanPlaceMentionName rejects narrative hotel and routing captions", () => {
  assert.equal(
    cleanPlaceMentionName("走路四分鐘能到地鐵站的飯店", japanProfile, "東京").rejectedReason,
    "narrative-or-routing-phrase",
  );
  assert.equal(
    cleanPlaceMentionName("在東武日光車站的公車站", japanProfile, "日光").rejectedReason,
    "relational-site-fragment",
  );
  assert.equal(cleanPlaceMentionName("要怎麼前往日光東照宮呢 東武日光車站", japanProfile, "日光").rejectedReason, "narrative-or-routing-phrase");
});

test("shouldExcludeAsPoiTitle blocks multi-clause glued titles", () => {
  assert.equal(shouldExcludeAsPoiTitle("世上最繁忙的十字路口 超好吃又便宜的壽司店 日光東照宮"), true);
  assert.equal(shouldExcludeAsPoiTitle("明治神宮"), false);
});

test("日光關鍵字會選擇 japan profile", () => {
  assert.equal(selectTravelExtractionProfile({ destinationHint: "日光", transcriptLanguage: "zh-TW" }).id, "japan");
});

test("cleanPlaceMentionName strips leading 的 and maps 嘉義市立美術館 alias", () => {
  assert.equal(clean("的嘉義美術館").cleanedName, "嘉義美術館");
  assert.equal(clean("嘉義市立美術館").cleanedName, "嘉義美術館");
});

test("cleanPlaceMentionName rejects Arabic-only script without CJK/Latin", () => {
  const r = cleanPlaceMentionName("القاهرة", taiwanProfile, "台北");
  assert.equal(r.cleanedName, "");
  assert.equal(r.rejectedReason, "unsupported-script");
});

test("fuzzyDedupePlaceMentions merges similar names near same timestamp", () => {
  const merged = fuzzyDedupePlaceMentions(
    dedupePlaceMentions([
      {
        rawText: "國立故宮博物院",
        name: "國立故宮博物院",
        normalizedName: "國立故宮博物院",
        startSeconds: 10,
        endSeconds: 20,
        context: "",
        source: "regex",
        confidence: 0.8,
      },
      {
        rawText: "故宮博物院",
        name: "故宮博物院",
        normalizedName: "故宮博物院",
        startSeconds: 25,
        endSeconds: 35,
        context: "",
        source: "regex",
        confidence: 0.7,
      },
    ]),
  );
  assert.equal(merged.length, 1);
  assert.ok(merged[0]?.name === "故宮博物院" || merged[0]?.name === "國立故宮博物院");
});

test("isGenericTravelLocation flags searchy list labels", () => {
  assert.equal(
    isGenericTravelLocation({ name: "5間私藏咖啡廳", profile: taiwanProfile }),
    true,
  );
  assert.equal(
    isGenericTravelLocation({ name: "大稻埕老宅咖啡廳", profile: taiwanProfile }),
    true,
  );
});
