import assert from "node:assert/strict";
import test from "node:test";
import { getSegmentSeekSeconds, parseTimestampToSeconds } from "@/lib/videoTimestamp";

test("parseTimestampToSeconds accepts mm:ss and hh:mm:ss only", () => {
  assert.equal(parseTimestampToSeconds("01:30"), 90);
  assert.equal(parseTimestampToSeconds("1:02:03"), 3723);
  assert.equal(parseTimestampToSeconds("bad"), 0);
  assert.equal(parseTimestampToSeconds("約三分鐘"), 0);
});

test("getSegmentSeekSeconds prefers numeric startSeconds", () => {
  assert.equal(
    getSegmentSeekSeconds({
      startSeconds: 125,
      timestamp: "n/a",
      startLabel: undefined,
      timestampConfidence: "low",
    }),
    125,
  );
});

test("getSegmentSeekSeconds returns null for low confidence non-timestamp label without startSeconds", () => {
  assert.equal(
    getSegmentSeekSeconds({
      startSeconds: undefined,
      timestamp: "開場",
      startLabel: "開場",
      timestampConfidence: "low",
    }),
    null,
  );
});

test("getSegmentSeekSeconds parses standard label when confidence allows", () => {
  assert.equal(
    getSegmentSeekSeconds({
      startSeconds: undefined,
      timestamp: "02:10",
      startLabel: undefined,
      timestampConfidence: "high",
    }),
    130,
  );
});
