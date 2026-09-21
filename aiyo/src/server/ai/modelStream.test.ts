import assert from "node:assert/strict";
import test from "node:test";
import { readModelStream } from "./modelStream";
function response(raw: string) {
  const bytes = new TextEncoder().encode(raw);
  return new Response(new ReadableStream({ start(controller) {
    for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
    controller.close();
  } }));
}
test("Ollama streams split UTF8 content without reasoning", async () => {
  const chunks: string[] = [];
  const text = await readModelStream(response('{"message":{"thinking":"secret","content":"東京"}}\n{"message":{"content":"旅遊"},"done":true}\n'), "ollama", (chunk) => chunks.push(chunk));
  assert.equal(text, "東京旅遊"); assert.deepEqual(chunks, ["東京", "旅遊"]);
});
test("OpenAI SSE frames expose only content", async () => {
  const text = await readModelStream(response('data: {"choices":[{"delta":{"reasoning_content":"private"}}]}\n\ndata: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n'), "openai", () => {});
  assert.equal(text, "你好");
});
test("stream errors cannot be mistaken for completion", async () => {
  await assert.rejects(readModelStream(response('{"error":"failed"}\n'), "ollama", () => {}));
});
