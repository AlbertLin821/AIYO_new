import assert from "node:assert/strict";
import test from "node:test";
import { cleanYouTubeDescription } from "@/server/providers/youtubeProvider";

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

