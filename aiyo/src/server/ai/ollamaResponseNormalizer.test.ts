import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeOllamaJsonContent,
  normalizeOllamaPlainText,
} from "@/server/ai/ollamaResponseNormalizer";

test("plain text 簡體轉繁體", () => {
  const input = "这个行程适合第一次来台湾的旅客。";
  const output = normalizeOllamaPlainText(input);
  assert.equal(output, "這個行程適合第一次來台灣的旅客。");
});

test("JSON value 轉繁體", () => {
  const input = JSON.stringify({
    summary: "这个行程包含夜市和老街",
    segments: [{ text: "推荐去这个景点" }],
  });
  const output = normalizeOllamaJsonContent(input);
  const parsed = JSON.parse(output) as {
    summary: string;
    segments: Array<{ text: string }>;
  };
  assert.equal(parsed.summary, "這個行程包含夜市和老街");
  assert.equal(parsed.segments[0]?.text, "推薦去這個景點");
});

test("JSON key 保持不變", () => {
  const input = JSON.stringify({
    summary: "这个景点很热门",
    apiFieldName: "这个值会转成繁体",
    nested: { modelName: "gemma4:26B" },
  });
  const output = normalizeOllamaJsonContent(input);
  const parsed = JSON.parse(output) as Record<string, unknown>;
  assert.ok(Object.hasOwn(parsed, "summary"));
  assert.ok(Object.hasOwn(parsed, "apiFieldName"));
  assert.equal((parsed.nested as Record<string, unknown>).modelName, "gemma4:26B");
});

test("URL 保持不變", () => {
  const input = "请参考 https://www.youtube.com/watch?v=abc123XYZ89 这个链接。";
  const output = normalizeOllamaPlainText(input);
  assert.ok(output.includes("https://www.youtube.com/watch?v=abc123XYZ89"));
  assert.equal(output, "請參考 https://www.youtube.com/watch?v=abc123XYZ89 這個連結。");
});

test("English proper nouns 保持不變", () => {
  const input = "请使用 OpenAI API 和 Google Maps API。";
  const output = normalizeOllamaPlainText(input);
  assert.equal(output, "請使用 OpenAI API 和 Google Maps API。");
});
