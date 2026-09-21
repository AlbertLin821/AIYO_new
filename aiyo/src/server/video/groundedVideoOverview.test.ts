import assert from "node:assert/strict";
import test from "node:test";
import type { VideoSummarySegment } from "@/types";
import { buildGroundedVideoOverview } from "@/server/video/groundedVideoOverview";

function segment(text: string, startSeconds = 0): VideoSummarySegment {
  return { id: text, timestamp: "0:00", text, startSeconds, timestampSource: "youtube-transcript", timestampConfidence: "high" };
}

test("overview includes chronological source excerpts and deduplicated named places/foods", () => {
  const result = buildGroundedVideoOverview({
    segments: [segment("接著來到淺草寺。", 3661), segment("從東京車站出發。", 0)],
    places: ["東京車站", " 東京車站 ", "淺草寺"], foods: ["拉麵", "拉麵"], transcriptAvailable: true,
  });
  assert.ok(result.indexOf("[0:00] 從東京車站出發。") < result.indexOf("[1:01:01] 接著來到淺草寺。"));
  assert.match(result, /地點：東京車站、淺草寺。/);
  assert.match(result, /飲食：拉麵。/);
  assert.doesNotMatch(result, /營業|門票|交通費/);
});

test("description-only content is clearly attributed, cleaned and has no timestamp", () => {
  const result = buildGroundedVideoOverview({
    segments: [segment("不該當作字幕", 60)], places: ["京都"], foods: [], transcriptAvailable: false,
    description: "00:30 京都散步\n訂閱頻道 https://example.com\n1:02:30 品嘗抹茶 #旅行\nhttps://example.com",
  });
  assert.match(result, /来源|來源：影片描述/);
  assert.match(result, /京都散步 品嘗抹茶/);
  assert.match(result, /沒有可用字幕/);
  assert.doesNotMatch(result, /\d+:\d+|https|訂閱|#旅行|不該當作字幕/);
});

test("only verified caption timing is shown and model summary is never substituted", () => {
  const result = buildGroundedVideoOverview({
    segments: [
      { ...segment("提到店名", 5000), timestampConfidence: "low", summary: "免費入場全天開放" },
      { ...segment("描述不當字幕", 45), timestampSource: "description-fallback" },
      { ...segment("未確認時間", 60), timestampSource: undefined },
    ], places: [], foods: [], transcriptAvailable: true,
  });
  assert.match(result, /提到店名|未確認時間/);
  assert.doesNotMatch(result, /\[|描述不當字幕|免費入場/);
});

test("caps source highlights and total text, deduplicates excerpts", () => {
  const repeated = segment("相同內容", 0);
  const result = buildGroundedVideoOverview({
    segments: [repeated, repeated, ...Array.from({ length: 20 }, (_, n) => segment(`${n} ${"內容".repeat(300)}`, n + 1))],
    places: Array.from({ length: 40 }, (_, n) => `${n}${"地點".repeat(100)}`),
    foods: Array.from({ length: 40 }, (_, n) => `${n}${"食物".repeat(100)}`), transcriptAvailable: true,
  });
  assert.equal((result.match(/• /g) || []).length, 6);
  assert.equal((result.match(/相同內容/g) || []).length, 1);
  assert.ok(Array.from(result).length <= 2000);
});

test("missing content produces honest empty result without invented trip facts", () => {
  assert.equal(buildGroundedVideoOverview({ segments: [], places: [], foods: [], transcriptAvailable: true }), "目前沒有足夠的影片內容可整理摘要。");
  const result = buildGroundedVideoOverview({ segments: [], places: [], foods: [], description: "訂閱支持\nhttps://example.com", transcriptAvailable: false });
  assert.equal(result, "目前沒有可用字幕；以上僅整理影片描述，不提供片段時間定位。");
});
