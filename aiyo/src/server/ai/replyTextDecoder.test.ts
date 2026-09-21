import assert from "node:assert/strict";
import test from "node:test";
import { createReplyTextDecoder } from "@/server/ai/replyTextDecoder";

function decode(chunks: string[]): string {
  const decoder = createReplyTextDecoder();
  return chunks.map((chunk) => decoder.push(chunk)).join("");
}

test("streams only top-level replyText across every possible two-chunk boundary", () => {
  const source = '{"actions":[{"replyText":"private","name":"tool"}],"flag":true,"replyText":"建議\\n東京\\t\\\"散步\\\"\\uD83D\\uDE80","after":"secret"}';
  for (let split = 0; split <= source.length; split += 1) {
    assert.equal(decode([source.slice(0, split), source.slice(split)]), '建議\n東京\t"散步"🚀');
  }
  assert.equal(decode(source.split("")), '建議\n東京\t"散步"🚀');
});

test("returns new text immediately and never repeats completed replies", () => {
  const decoder = createReplyTextDecoder();
  assert.equal(decoder.push('{"replyText":"東'), "東");
  assert.equal(decoder.push("京"), "京");
  assert.equal(decoder.push('\"散步" , "replyText":"private"}'), "");
  assert.equal(decoder.push('{"replyText":"second"}'), "");
});

test("handles all JSON escapes and literal surrogate pairs split between chunks", () => {
  const reply = '東京🚀 / \\ \b \f \r \n \t "';
  assert.equal(decode(JSON.stringify({ replyText: reply }).split("")), reply);
  assert.equal(decode('{"reply\\u0054ext":"\\u6771\\u4eac"}'.split("")), "東京");
});

test("never treats nested keys or JSON embedded in other strings as replyText", () => {
  const source = JSON.stringify({
    reasoning: '{"replyText":"secret"}',
    actions: [{ nested: { replyText: "secret" } }],
    number: -3.2e4,
    empty: null,
    replyText: "公開內容",
  });
  assert.equal(decode(source.split("")), "公開內容");
});

test("fails closed for prose, arrays, invalid previous values and non-string replyText", () => {
  for (const source of [
    'reasoning {"replyText":"private"}',
    '[{"replyText":"private"}]',
    '{"other":invalid,"replyText":"private"}',
    '{"other":{"broken":},"replyText":"private"}',
    '{"replyText":{"replyText":"private"}}',
  ]) assert.equal(decode(source.split("")), "");
});

test("incomplete and invalid escapes never reveal remaining fields", () => {
  assert.equal(decode(['{"replyText":"安全\\u67']), "安全");
  assert.equal(decode(['{"replyText":"安全\\qSECRET","other":"private"}']), "安全");
  assert.equal(decode(['{"replyText":"安全\\uD83D', '\\uDE80"}']), "安全🚀");
  assert.equal(decode(['{"replyText":"安全\\uD83D', 'xSECRET"}']), "安全");
});
