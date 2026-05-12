import assert from "node:assert/strict";
import test from "node:test";
import { mergeVideoMomentPolishIntoSegments } from "@/server/video/videoSegmentJsonPolish";
import type { VideoSummarySegment } from "@/types";

test("mergeVideoMomentPolishIntoSegments merges matched ids and preserves timestamps", () => {
  const segments: VideoSummarySegment[] = [
    {
      id: "moment_1",
      timestamp: "00:01:00",
      text: "",
      title: "舊",
      locationHints: ["阿里山"],
      startSeconds: 60,
      endSeconds: 120,
      extractionSource: "deterministic",
    },
  ];
  const { next, matched } = mergeVideoMomentPolishIntoSegments(segments, [
    {
      id: "moment_1",
      timestamp: "00:09:99",
      startSeconds: 999,
      endSeconds: 1000,
      title: "新標",
      text: "內文",
      summary: "新摘",
      locationHints: ["阿里山國家風景區"],
    },
  ]);
  assert.equal(matched, 1);
  assert.equal(next[0].title, "新標");
  assert.equal(next[0].summary, "新摘");
  assert.equal(next[0].text, "內文");
  assert.equal(next[0].startSeconds, 60);
  assert.equal(next[0].endSeconds, 120);
  assert.equal(next[0].timestamp, "00:01:00");
  assert.equal(next[0].extractionSource, "ai-polished");
  assert.deepEqual(next[0].locationHints, ["阿里山國家風景區"]);
});

test("mergeVideoMomentPolishIntoSegments keeps original when id missing in polish payload", () => {
  const segments: VideoSummarySegment[] = [
    {
      id: "moment_1",
      timestamp: "00:01:00",
      text: "",
      title: "舊",
      startSeconds: 60,
      endSeconds: 120,
      extractionSource: "deterministic",
    },
  ];
  const { next, matched } = mergeVideoMomentPolishIntoSegments(segments, [
    {
      id: "other",
      timestamp: "00:00",
      startSeconds: 0,
      endSeconds: 1,
      title: "x",
      text: "",
      summary: "",
      locationHints: [],
    },
  ]);
  assert.equal(matched, 0);
  assert.equal(next[0].title, "舊");
  assert.equal(next[0].extractionSource, "deterministic");
});
