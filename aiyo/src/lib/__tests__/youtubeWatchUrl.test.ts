import assert from "node:assert/strict";
import test from "node:test";
import {
  buildYoutubeWatchUrl,
  formatSecondsAsClock,
  parseYoutubeTimeFromUrl,
} from "@/lib/youtubeWatchUrl";

test("formatSecondsAsClock uses hours when needed", () => {
  assert.equal(formatSecondsAsClock(90), "1:30");
  assert.equal(formatSecondsAsClock(3661), "1:01:01");
  assert.equal(formatSecondsAsClock(0), "0:00");
});

test("buildYoutubeWatchUrl appends t when start given", () => {
  assert.equal(
    buildYoutubeWatchUrl("abc", 125),
    "https://www.youtube.com/watch?v=abc&t=125s",
  );
  assert.equal(buildYoutubeWatchUrl("abc"), "https://www.youtube.com/watch?v=abc");
});

test("parseYoutubeTimeFromUrl reads t and start", () => {
  assert.deepEqual(parseYoutubeTimeFromUrl("https://www.youtube.com/watch?v=x&t=90"), {
    startSeconds: 90,
  });
  assert.deepEqual(parseYoutubeTimeFromUrl("https://youtu.be/x?t=1m30s"), {
    startSeconds: 90,
  });
  assert.deepEqual(parseYoutubeTimeFromUrl("https://www.youtube.com/watch?v=x&start=45"), {
    startSeconds: 45,
  });
  assert.deepEqual(parseYoutubeTimeFromUrl("https://example.com"), {});
});
