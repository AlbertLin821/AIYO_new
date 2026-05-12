import assert from "node:assert/strict";
import test from "node:test";
import { extractFinalVideoPlaces } from "@/server/video/placeExtraction/finalPlaceBuilder";
import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

function line(id: string, startSeconds: number, text: string): NormalizedTranscriptLine {
  return {
    id,
    startSeconds,
    endSeconds: startSeconds + 5,
    text,
    rawText: text,
    timestampSource: "youtube-transcript",
    timestampConfidence: "high",
  };
}

async function extractNames(transcriptLines: NormalizedTranscriptLine[], destinationHint?: string) {
  const result = await extractFinalVideoPlaces({
    transcriptLines,
    title: "travel video",
    description: "",
    destinationHint,
    enableGeocode: false,
    enableSearch: false,
  });
  return result.places.map((place) => place.name);
}

test("Kumamoto regression keeps only canonical clean places", async () => {
  const names = await extractNames(
    [
      line("1", 0, "草千里"),
      line("2", 5, "黑亭"),
      line("3", 10, "熊本站"),
      line("4", 15, "從熊本車站"),
      line("5", 20, "直達熊本站"),
      line("6", 25, "它就在熊本車站"),
      line("7", 30, "可直達市區熊本站"),
      line("8", 35, "城的交通也十分簡單 從熊本車"),
      line("9", 40, "走進對長輩極度友善的熊本城"),
      line("10", 45, "距離熊本櫻町巴士總站"),
      line("11", 50, "它位在熊本櫻町巴士總站"),
      line("12", 55, "走路去熊本城"),
      line("13", 60, "是體驗熊本城"),
      line("14", 65, "市的靈魂 熊本城"),
      line("15", 70, "熊本城"),
      line("16", 75, "最棒的是重建後的熊本城"),
    ],
    "熊本",
  );
  assert.deepEqual(names, ["草千里", "黑亭", "熊本車站", "熊本城", "熊本櫻町巴士總站"]);
});

test("Taiwan night market and food shop keeps named places only", async () => {
  const names = await extractNames(
    [
      line("1", 0, "今天來到嘉義文化路夜市"),
      line("2", 5, "這裡有很多小吃"),
      line("3", 10, "火雞肉飯真的很好吃"),
      line("4", 15, "推薦郭家火雞肉飯"),
      line("5", 20, "晚上可以走路去文化路夜市"),
      line("6", 25, "附近很多美食"),
    ],
    "嘉義",
  );
  assert.deepEqual(names, ["嘉義文化路夜市", "郭家火雞肉飯"]);
});

test("English travel transcript keeps explicit POIs only", async () => {
  const names = await extractNames(
    [
      line("1", 0, "We start from Shibuya Station."),
      line("2", 5, "Then we walk to Shibuya Crossing."),
      line("3", 10, "This area is very busy."),
      line("4", 15, "Next stop is Tokyo Tower."),
      line("5", 20, "Tokyo travel is amazing."),
    ],
    "Tokyo",
  );
  assert.deepEqual(names, ["Shibuya Station", "Shibuya Crossing", "Tokyo Tower"]);
});

test("Korean transcript keeps explicit place names only", async () => {
  const names = await extractNames(
    [
      line("1", 0, "從弘大入口站出發"),
      line("2", 5, "走路到弘大商圈"),
      line("3", 10, "晚上去明洞逛街"),
      line("4", 15, "韓國美食很多"),
    ],
    "首爾",
  );
  assert.deepEqual(names, ["弘大入口站", "弘大商圈", "明洞"]);
});

test("City-only transcript returns empty list", async () => {
  const names = await extractNames(
    [
      line("1", 0, "今天來到大阪"),
      line("2", 5, "大阪真的很好玩"),
      line("3", 10, "大阪美食很多"),
      line("4", 15, "日本旅遊很方便"),
    ],
    "大阪",
  );
  assert.deepEqual(names, []);
});
