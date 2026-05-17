import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseWebSearch } from "@/server/search/searchIntent";

test("shouldUseWebSearch returns true for travel factual queries", () => {
  assert.equal(shouldUseWebSearch("嘉義景點推薦和營業時間"), true);
  assert.equal(shouldUseWebSearch("2026 local events in Tokyo"), true);
  assert.equal(shouldUseWebSearch("這家 restaurant opening hours"), true);
  assert.equal(shouldUseWebSearch("幫我規劃台南三天自由行"), true);
});

test("shouldUseWebSearch returns false for generic chat", () => {
  assert.equal(shouldUseWebSearch("你好，今天心情如何？"), false);
  assert.equal(shouldUseWebSearch("謝謝你"), false);
  assert.equal(shouldUseWebSearch(""), false);
});
