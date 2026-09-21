import assert from "node:assert/strict";
import test from "node:test";
import { buildGroundedVideoSegments } from "../groundedVideoSegments";
import type { NormalizedTranscriptLine } from "../transcriptProcessing";

const line: NormalizedTranscriptLine = { id: "line_1", startSeconds: 5, endSeconds: 8,
  text: "東京車站吃拉麵", rawText: "東京車站吃拉麵", timestampSource: "youtube-transcript", timestampConfidence: "high" };

test("segments use caption evidence and boundaries instead of model timestamps", () => {
  const [segment] = buildGroundedVideoSegments({ places: [{ name: "東京車站", startSeconds: 5000, evidence: "虛構內容" }],
    foods: [{ name: "拉麵", startSeconds: 999 }], transcriptLines: [line] });
  assert.equal(segment.startSeconds, 5);
  assert.equal(segment.endSeconds, 8);
  assert.equal(segment.summary, line.text);
  assert.deepEqual(segment.sourceTranscriptLineIds, ["line_1"]);
  assert.deepEqual(segment.foods, ["拉麵"]);
});

test("description-only and unmentioned places cannot produce seekable segments", () => {
  const places = [{ name: "東京車站", startSeconds: 60 }];
  assert.deepEqual(buildGroundedVideoSegments({ places, foods: [], transcriptLines: [] }), []);
  assert.deepEqual(buildGroundedVideoSegments({ places, foods: [], transcriptLines: [{ ...line, timestampSource: "description-fallback" }] }), []);
  assert.deepEqual(buildGroundedVideoSegments({ places: [{ name: "淺草寺", startSeconds: 5 }], foods: [], transcriptLines: [line] }), []);
});
