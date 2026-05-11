import assert from "node:assert/strict";
import test from "node:test";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";
import { buildMomentSegments, toVideoSummarySegments } from "@/server/video/momentSegmentBuilder";
import { dedupePlaceMentions, normalizePlaceMentionName } from "@/server/video/placeMentionNormalizer";
import { extractTimestampAwarePlaceMentions } from "@/server/video/placeMentionExtractor";
import { preprocessTranscript } from "@/server/video/transcriptProcessing";
import {
  englishGlobalProfile,
  japanProfile,
  selectTravelExtractionProfile,
  taiwanProfile,
} from "@/server/video/travelExtractionProfiles";
import { chiayiFoodTranscriptFixture } from "@/server/video/__tests__/fixtures/chiayiFoodTranscript";
import { osakaEnglishTranscriptFixture } from "@/server/video/__tests__/fixtures/osakaEnglishTranscript";
import { tokyoTravelTranscriptFixture } from "@/server/video/__tests__/fixtures/tokyoTravelTranscript";

const CHIAYI_BLOCKED_NAMES = [
  "嘉義",
  "嘉義市",
  "嘉義縣",
  "嘉義美食",
  "嘉義景點",
  "嘉義旅遊",
  "嘉義兩天一夜",
  "市區",
  "附近",
  "美食",
  "小吃",
  "景點",
];

const CHIAYI_EXPECTED_POIS = [
  "文化路夜市",
  "林聰明砂鍋魚頭",
  "民主火雞肉飯",
  "檜意森活村",
  "北門驛",
  "阿里山森林鐵路車庫園區",
  "嘉義公園",
];

test("profile selection：嘉義市 + zh-TW + 標題為 taiwan", () => {
  const profile = selectTravelExtractionProfile({
    destinationHint: "嘉義市",
    transcriptLanguage: "zh-TW",
    title: "嘉義兩天一夜美食旅行",
  });
  assert.equal(profile.id, "taiwan");
});

test("preprocessTranscript：移除開頭 filler，保留地點與上下文", () => {
  const lines = preprocessTranscript(
    [{ timestamp: "00:35", startSeconds: 35, durationSeconds: 6, text: "我們現在來到文化路夜市，晚上這邊有很多小吃。" }],
    taiwanProfile,
  );
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].text.startsWith("我們現在來到"));
  assert.ok(lines[0].text.includes("文化路夜市"));
});

test("嘉義 fixture：擷取具體 POI、過濾泛用地名、純食物不成為 mention", () => {
  const lines = preprocessTranscript(chiayiFoodTranscriptFixture, taiwanProfile);
  const raw = extractTimestampAwarePlaceMentions({
    lines,
    profile: taiwanProfile,
    destinationHint: "嘉義市",
  });
  const normalized = raw.map((m) => {
    const name = normalizePlaceMentionName(m.name, taiwanProfile);
    return { ...m, name, normalizedName: name.toLowerCase().replace(/\s+/g, "") };
  });
  const mentions = dedupePlaceMentions(normalized).filter(
    (m) =>
      m.name &&
      !isGenericTravelLocation({
        name: m.name,
        destinationHint: "嘉義市",
        profile: taiwanProfile,
      }),
  );

  const names = mentions.map((m) => m.name);
  for (const blocked of CHIAYI_BLOCKED_NAMES) {
    assert.ok(
      !names.includes(blocked),
      `不應將泛用地名當成擷取地點：${blocked}`,
    );
  }

  let hit = 0;
  for (const poi of CHIAYI_EXPECTED_POIS) {
    if (names.some((n) => n.includes(poi) || n === poi)) {
      hit += 1;
    }
  }
  assert.ok(hit >= 5, `預期至少 5 個具體 POI，實際命中 ${hit}：${names.join("、")}`);

  assert.ok(!names.includes("火雞肉飯"), "純「火雞肉飯」不應為地點 mention");
  assert.ok(!names.includes("砂鍋魚頭"), "純「砂鍋魚頭」不應為地點 mention");

  assert.ok(
    mentions.some((m) => (m.foods || []).includes("火雞肉飯")),
    "應自文中標記食物：火雞肉飯",
  );
  assert.ok(
    mentions.some((m) => (m.foods || []).includes("砂鍋魚頭")),
    "應自文中標記食物：砂鍋魚頭",
  );

  const culturalNight = mentions.filter((m) => m.name.includes("文化路夜市"));
  assert.ok(culturalNight.length >= 1, "文化夜市／文化路夜市應合併為文化路夜市（至少一筆）");
});

test("嘉義 fixture：moment segments 時間遞增、數量與欄位門檻", () => {
  const lines = preprocessTranscript(chiayiFoodTranscriptFixture, taiwanProfile);
  const raw = extractTimestampAwarePlaceMentions({
    lines,
    profile: taiwanProfile,
    destinationHint: "嘉義市",
  });
  const normalized = raw.map((m) => {
    const name = normalizePlaceMentionName(m.name, taiwanProfile);
    return { ...m, name, normalizedName: name.toLowerCase().replace(/\s+/g, "") };
  });
  const mentions = dedupePlaceMentions(normalized).filter(
    (m) =>
      m.name &&
      !isGenericTravelLocation({
        name: m.name,
        destinationHint: "嘉義市",
        profile: taiwanProfile,
      }),
  );

  const moments = buildMomentSegments({
    mentions,
    videoDurationSeconds: 3600,
    maxSegments: 8,
  });
  assert.ok(moments.length >= 4, `預期至少 4 個片段，實際 ${moments.length}`);

  for (let i = 1; i < moments.length; i++) {
    assert.ok(
      moments[i].startSeconds >= moments[i - 1].startSeconds,
      "重點片段應依時間遞增排序",
    );
  }

  const summarySegments = toVideoSummarySegments(moments);
  for (const seg of summarySegments) {
    assert.ok(seg.timestamp, "應有 timestamp");
    assert.ok(seg.title && seg.title.length > 0, "應有 title");
    assert.ok(seg.text && seg.text.length > 0, "應有 text");
    assert.ok((seg.locationHints || []).length > 0, "應有 locationHints");
    assert.ok(seg.text.length <= 80, "說明長度應 <= 80 字");
    assert.ok(!seg.text.includes("然後這邊可以看到"), "文字不應為逐字稿 dump");
  }
});

test("東京 fixture：拒絕泛用東京、保留鐵塔／車站／淺草寺、拉麵為食物而非地點", () => {
  const lines = preprocessTranscript(tokyoTravelTranscriptFixture, japanProfile);
  const raw = extractTimestampAwarePlaceMentions({
    lines,
    profile: japanProfile,
    destinationHint: "東京",
  });
  const names = raw.map((m) => m.name);
  assert.ok(!names.some((n) => n === "東京"), "不應擷取單獨「東京」為地點");
  assert.ok(!names.some((n) => n.includes("東京旅遊")), "不應擷取「東京旅遊」");
  assert.ok(names.some((n) => n.includes("東京鐵塔")), "應擷取東京鐵塔");
  assert.ok(names.some((n) => n.includes("東京車站")), "應擷取東京車站");
  assert.ok(names.some((n) => n.includes("淺草寺")), "應擷取淺草寺");
  assert.ok(!names.includes("拉麵"), "純「拉麵」不應為地點 mention");
});

test("大阪英文 fixture：Osaka Castle、Dotonbori、Kuromon Market、takoyaki 為食物", () => {
  const lines = preprocessTranscript(osakaEnglishTranscriptFixture, englishGlobalProfile);
  const raw = extractTimestampAwarePlaceMentions({
    lines,
    profile: englishGlobalProfile,
    destinationHint: "Osaka",
  });
  const names = raw.map((m) => m.name.toLowerCase());
  assert.ok(!names.includes("osaka travel guide"));
  assert.ok(names.some((n) => n.includes("osaka castle")));
  assert.ok(names.some((n) => n.includes("dotonbori")));
  assert.ok(names.some((n) => n.includes("kuromon market")));
  assert.ok(!names.includes("takoyaki"));
  assert.ok(raw.some((m) => (m.foods || []).map((f) => f.toLowerCase()).includes("takoyaki")));
});

test("preprocessTranscript：zh-CN 字幕可走簡轉繁字詞替換", () => {
  const lines = preprocessTranscript(
    [{ timestamp: "00:01", startSeconds: 1, durationSeconds: 2, text: "这个景点很适合旅客。" }],
    taiwanProfile,
    { captionLanguage: "zh-CN" },
  );
  assert.ok(lines[0].text.includes("這個") || lines[0].text.includes("景點"));
  assert.ok(!lines[0].text.includes("这个"), "簡體「这个」應轉為繁體");
});
