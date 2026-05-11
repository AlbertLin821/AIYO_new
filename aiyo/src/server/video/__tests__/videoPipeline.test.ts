import assert from "node:assert/strict";
import test from "node:test";
import { buildVideoSegmentPrompt } from "@/server/ai/promptBuilder";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";
import { buildMomentSegments } from "@/server/video/momentSegmentBuilder";
import { dedupePlaceMentions, normalizePlaceMentionName } from "@/server/video/placeMentionNormalizer";
import { extractTimestampAwarePlaceMentions } from "@/server/video/placeMentionExtractor";
import { preprocessTranscript, transcriptPreprocess } from "@/server/video/transcriptProcessing";
import {
  englishGlobalProfile,
  japanProfile,
  selectTravelExtractionProfile,
  taiwanProfile,
} from "@/server/video/travelExtractionProfiles";
import {
  youtubeOutlineExpectedPlaces,
  youtubeOutlineTranscriptFixture,
} from "@/server/video/__tests__/fixtures/youtubeTranscriptOutlineFixture";

test("profile selection supports Taiwan/Japan/English", () => {
  assert.equal(selectTravelExtractionProfile({ destinationHint: "嘉義" }).id, "taiwan");
  assert.equal(selectTravelExtractionProfile({ destinationHint: "東京" }).id, "japan");
  assert.equal(selectTravelExtractionProfile({ transcriptLanguage: "en" }).id, "english-global");
});

test("generic filter rejects city-only but keeps specific POI", () => {
  assert.equal(isGenericTravelLocation({ name: "嘉義", profile: taiwanProfile, destinationHint: "嘉義" }), true);
  assert.equal(isGenericTravelLocation({ name: "嘉義美食", profile: taiwanProfile, destinationHint: "嘉義" }), true);
  assert.equal(isGenericTravelLocation({ name: "文化路夜市", profile: taiwanProfile, destinationHint: "嘉義" }), false);
  assert.equal(isGenericTravelLocation({ name: "東京", profile: japanProfile, destinationHint: "東京" }), true);
  assert.equal(isGenericTravelLocation({ name: "東京鐵塔", profile: japanProfile, destinationHint: "東京" }), false);
});

test("transcript preprocessing removes filler prefixes but keeps timestamps", () => {
  const lines = preprocessTranscript(
    [
      { timestamp: "00:10", startSeconds: 10, durationSeconds: 3, text: "我們現在來到 文化路夜市" },
      { timestamp: "00:20", startSeconds: 20, durationSeconds: 4, text: "接下來 要去 林聰明砂鍋魚頭" },
    ],
    taiwanProfile,
  );
  assert.equal(lines.length, 2);
  assert.ok(lines[0].text.includes("文化路夜市"));
  assert.equal(lines[0].startSeconds, 10);
  assert.equal(lines[1].endSeconds >= 24, true);
});

test("youtube-proj outline fixture preprocesses duplicate subtitles and concrete places", () => {
  const lines = transcriptPreprocess(youtubeOutlineTranscriptFixture, taiwanProfile);
  assert.equal(lines.filter((line) => line.text.includes("文化路夜市")).length, 1);

  const mentions = dedupePlaceMentions(
    extractTimestampAwarePlaceMentions({
      lines,
      profile: taiwanProfile,
      destinationHint: "嘉義市",
    }),
  );
  const names = mentions.map((mention) => mention.name);
  for (const expected of youtubeOutlineExpectedPlaces) {
    assert.ok(names.includes(expected), `expected ${expected} in ${names.join(", ")}`);
  }
  assert.ok(!names.includes("嘉義市"));

  const segments = buildMomentSegments({ mentions, videoDurationSeconds: 120, maxSegments: 8 });
  assert.deepEqual(
    segments.map((segment) => segment.startSeconds),
    [...segments.map((segment) => segment.startSeconds)].sort((a, b) => a - b),
  );
});

test("Taiwan extraction keeps concrete POI and food mentions", () => {
  const lines = preprocessTranscript(
    [
      { timestamp: "00:12", startSeconds: 12, durationSeconds: 6, text: "嘉義美食第一站 文化路夜市" },
      { timestamp: "00:45", startSeconds: 45, durationSeconds: 8, text: "這家就是 林聰明砂鍋魚頭" },
      { timestamp: "01:20", startSeconds: 80, durationSeconds: 5, text: "民主火雞肉飯 真的很香" },
    ],
    taiwanProfile,
  );
  const mentions = extractTimestampAwarePlaceMentions({ lines, profile: taiwanProfile, destinationHint: "嘉義" });
  const names = mentions.map((item) => item.name);
  assert.ok(names.some((name) => name.includes("文化路夜市")));
  assert.ok(names.some((name) => name.includes("林聰明砂鍋魚頭")));
  assert.ok(mentions.some((item) => (item.foods || []).includes("火雞肉飯")));
});

test("Japan extraction rejects generic Tokyo but keeps Tokyo Tower and station", () => {
  const lines = preprocessTranscript(
    [
      { timestamp: "00:08", startSeconds: 8, durationSeconds: 5, text: "東京旅遊今天開始" },
      { timestamp: "00:26", startSeconds: 26, durationSeconds: 5, text: "我們來到東京鐵塔拍照" },
      { timestamp: "01:02", startSeconds: 62, durationSeconds: 5, text: "下一站東京車站" },
      { timestamp: "01:50", startSeconds: 110, durationSeconds: 4, text: "淺草寺附近吃拉麵" },
    ],
    japanProfile,
  );
  const mentions = extractTimestampAwarePlaceMentions({ lines, profile: japanProfile, destinationHint: "東京" });
  const names = mentions.map((item) => item.name);
  assert.ok(names.some((name) => name.includes("東京鐵塔")));
  assert.ok(names.some((name) => name.includes("東京車站")));
  assert.ok(names.some((name) => name.includes("淺草寺")));
  assert.ok(!names.some((name) => name === "東京"));
});

test("English extraction supports Osaka scenario and food extraction", () => {
  const lines = preprocessTranscript(
    [
      { timestamp: "00:10", startSeconds: 10, durationSeconds: 5, text: "Osaka travel guide starts here" },
      { timestamp: "00:40", startSeconds: 40, durationSeconds: 5, text: "next stop is Osaka Castle" },
      { timestamp: "01:20", startSeconds: 80, durationSeconds: 6, text: "we visit Dotonbori and Kuromon Market for takoyaki" },
    ],
    englishGlobalProfile,
  );
  const mentions = extractTimestampAwarePlaceMentions({
    lines,
    profile: englishGlobalProfile,
    destinationHint: "Osaka",
  });
  const names = mentions.map((item) => item.name.toLowerCase());
  assert.ok(names.some((name) => name.includes("osaka castle")));
  assert.ok(names.some((name) => name === "dotonbori"));
  assert.ok(names.some((name) => name.includes("kuromon market")));
  assert.ok(!names.some((name) => name.includes("we visit")));
  assert.ok(mentions.some((item) => (item.foods || []).map((food) => food.toLowerCase()).includes("takoyaki")));
});

test("mention normalization and dedupe merge near duplicates", () => {
  const normalizedA = normalizePlaceMentionName("嘉義文化路夜市", taiwanProfile);
  const normalizedB = normalizePlaceMentionName("文化路夜市", taiwanProfile);
  assert.equal(normalizedA, "文化路夜市");
  assert.equal(normalizedB, "文化路夜市");

  const deduped = dedupePlaceMentions([
    {
      rawText: "嘉義文化路夜市",
      name: "嘉義文化路夜市",
      normalizedName: "嘉義文化路夜市",
      startSeconds: 60,
      endSeconds: 65,
      context: "我們現在來到嘉義文化路夜市",
      source: "profile-pattern",
      confidence: 0.7,
    },
    {
      rawText: "文化路夜市",
      name: "文化路夜市",
      normalizedName: "文化路夜市",
      startSeconds: 90,
      endSeconds: 95,
      context: "文化路夜市很多小吃",
      source: "profile-pattern",
      confidence: 0.8,
    },
  ]);
  assert.equal(deduped.length, 1);
  assert.ok(deduped[0].name.includes("文化路夜市"));
});

test("moment segment generation produces non-transcript dump text", () => {
  const segments = buildMomentSegments({
    mentions: [
      {
        rawText: "文化路夜市",
        name: "文化路夜市",
        normalizedName: "文化路夜市",
        startSeconds: 120,
        endSeconds: 130,
        context: "我們現在來到文化路夜市然後這邊很多吃的",
        source: "profile-pattern",
        confidence: 0.86,
        foods: ["火雞肉飯", "砂鍋魚頭"],
        sourceTranscriptLineIds: ["line_3"],
      },
      {
        rawText: "林聰明砂鍋魚頭",
        name: "林聰明砂鍋魚頭",
        normalizedName: "林聰明砂鍋魚頭",
        startSeconds: 210,
        endSeconds: 220,
        context: "接下來要去林聰明砂鍋魚頭排隊",
        source: "profile-pattern",
        confidence: 0.9,
        foods: ["砂鍋魚頭"],
        sourceTranscriptLineIds: ["line_5"],
      },
    ],
    videoDurationSeconds: 900,
    maxSegments: 8,
  });
  assert.ok(segments.length >= 2);
  assert.ok(segments[0].title.length <= 18);
  assert.ok(!segments[0].text.includes("我們現在來到文化路夜市然後這邊很多吃的"));
  assert.ok(!segments[0].highlights.join(" ").includes("我們現在來到文化路夜市然後這邊很多吃的"));
  assert.ok((segments[0].locationHints || []).length > 0);
});

test("buildVideoSegmentPrompt requests strict JSON output for transcript chunks", () => {
  const prompt = buildVideoSegmentPrompt({
    title: "嘉義美食影片",
    description: "文化路夜市、郭家火雞肉飯與林聰明砂鍋魚頭。",
    destination: "嘉義市",
    transcriptSegments: [
      {
        timestamp: "00:18",
        startSeconds: 18,
        endSeconds: 23,
        text: "接著走到郭家火雞肉飯，點一碗火雞肉飯。",
      },
    ],
  });

  assert.match(prompt, /Return valid JSON only/);
  assert.match(prompt, /"segments"/);
  assert.match(prompt, /"extractedLocations"/);
  assert.match(prompt, /Do not use Simplified Chinese/);
});
