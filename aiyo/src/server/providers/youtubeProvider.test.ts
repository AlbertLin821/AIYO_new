import assert from "node:assert/strict";
import test from "node:test";
import {
  cleanYouTubeDescription,
  parseTranscriptVtt,
} from "@/server/providers/youtubeProvider";

test("cleanYouTubeDescription keeps useful travel text and removes CTA noise", () => {
  const cleaned = cleanYouTubeDescription(
    [
      "這集從嘉義東市場開始，吃阿宏師火雞肉飯，再到林聰明砂鍋魚頭，最後散步到文化路夜市。",
      "請記得訂閱我的頻道，按讚分享並開啟小鈴鐺！",
      "https://example.com/sponsor",
      "#嘉義美食 #旅遊 #vlog #subscribe",
      "合作邀約 business@example.com",
      "00:00 開場",
    ].join("\n"),
    90,
  );

  assert.match(cleaned, /嘉義東市場/);
  assert.match(cleaned, /阿宏師火雞肉飯/);
  assert.match(cleaned, /林聰明砂鍋魚頭/);
  assert.doesNotMatch(cleaned, /訂閱|按讚|https?:\/\/|business@example\.com|#嘉義美食|00:00/);
  assert.ok(cleaned.length <= 90);
});

test("parseTranscriptVtt keeps timed cues and strips inline tags", () => {
  const entries = parseTranscriptVtt(`WEBVTT

00:00:01.000 --> 00:00:03.500 align:start position:0%
<c.colorE5E5E5>嘉義大學 新民校區</c>

00:00:04.000 --> 00:00:06.000
<00:00:04.200><c>工具車</c>
`);

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.timestamp, "00:01");
  assert.equal(entries[0]?.text, "嘉義大學 新民校區");
  assert.equal(entries[1]?.timestamp, "00:04");
  assert.equal(entries[1]?.text, "工具車");
  assert.equal(entries[1]?.durationSeconds, 2);
});

