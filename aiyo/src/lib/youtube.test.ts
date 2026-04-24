import assert from "node:assert/strict";
import test from "node:test";
import { extractYouTubeVideoId } from "@/lib/youtube";

test("extractYouTubeVideoId extracts watch URL ids", () => {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/watch?v=abc123_DEF"), "abc123_DEF");
});

test("extractYouTubeVideoId extracts youtu.be URL ids", () => {
  assert.equal(extractYouTubeVideoId("https://youtu.be/abc123_DEF"), "abc123_DEF");
});

test("extractYouTubeVideoId extracts shorts URL ids", () => {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/shorts/abc123_DEF"), "abc123_DEF");
});

test("extractYouTubeVideoId extracts embed URL ids", () => {
  assert.equal(extractYouTubeVideoId("https://www.youtube.com/embed/abc123_DEF"), "abc123_DEF");
});

test("extractYouTubeVideoId returns null for invalid URLs", () => {
  assert.equal(extractYouTubeVideoId("https://example.com/watch?v=abc123_DEF"), null);
});
