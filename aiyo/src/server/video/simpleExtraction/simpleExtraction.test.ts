import assert from "node:assert/strict";
import test from "node:test";
import { mergeSimpleExtractionResults } from "@/server/video/simpleExtraction/mergeExtractionResults";
import { buildTranscriptChunks } from "@/server/video/simpleExtraction/transcriptChunker";
import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

function makeLine(index: number, startSeconds: number, text: string): NormalizedTranscriptLine {
  return {
    id: `line_${index}`,
    startSeconds,
    endSeconds: startSeconds + 5,
    text,
    rawText: text,
    timestampSource: "youtube-transcript",
    timestampConfidence: "high",
  };
}

test("buildTranscriptChunks keeps title/description in first chunk and preserves timestamps", () => {
  const lines = Array.from({ length: 20 }, (_, index) =>
    makeLine(index + 1, index * 30, `第${index + 1}段 ${"熊本旅行重點 ".repeat(12)}`),
  );

  const chunks = buildTranscriptChunks({
    title: "熊本一日遊",
    description: "車站、城與拉麵",
    transcriptLines: lines,
    maxCharsPerChunk: 1000,
    overlapChars: 50,
  });

  assert.ok(chunks.length >= 2);
  assert.match(chunks[0].text, /標題：熊本一日遊/);
  assert.match(chunks[0].text, /敘述：車站、城與拉麵/);
  assert.match(chunks[0].text, /\[0s\] 第1段/);
  assert.equal(chunks[0].startSeconds, 0);
  assert.ok((chunks[1].startSeconds ?? 0) > 0);
});

test("mergeSimpleExtractionResults dedupes and keeps foods out of places unless restaurant or shop", () => {
  const merged = mergeSimpleExtractionResults({
    chunkResults: [
      {
        places: [
          { name: "走路去熊本城", type: "attraction", evidence: "走路去熊本城", startSeconds: 30 },
          { name: "熊本站", type: "station", evidence: "熊本站", startSeconds: 0 },
          { name: "熊本拉麵", type: "unknown", evidence: "熊本拉麵", startSeconds: 60 },
          { name: "黑亭", type: "restaurant", evidence: "黑亭拉麵", startSeconds: 80 },
        ],
        foods: [
          { name: "熊本拉麵", evidence: "熊本拉麵", startSeconds: 60 },
          { name: "馬肉刺身", evidence: "馬肉刺身", startSeconds: 90 },
        ],
      },
    ],
  });

  assert.deepEqual(
    merged.places.map((place) => place.name),
    ["熊本城", "熊本車站", "黑亭"],
  );
  assert.deepEqual(
    merged.foods.map((food) => food.name),
    ["熊本拉麵", "馬肉刺身"],
  );
});
