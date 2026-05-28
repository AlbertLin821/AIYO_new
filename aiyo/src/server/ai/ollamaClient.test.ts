import assert from "node:assert/strict";
import test from "node:test";

import { chatWithOllama } from "@/server/ai/ollamaClient";

test("chatWithOllama passes JSON schema format and deterministic options", async () => {
  const originalFetch = globalThis.fetch;
  const captured: { requestBody?: Record<string, unknown> } = {};
  const schema = {
    type: "object",
    properties: {
      answer: { type: "string" },
    },
    required: ["answer"],
  };

  globalThis.fetch = async (_input, init) => {
    captured.requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({ message: { content: '{"answer":"完成"}' } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const response = await chatWithOllama({
      format: schema,
      options: { num_ctx: 32768 },
      messages: [{ role: "user", content: "請輸出 JSON" }],
    });

    assert.equal(response, '{"answer":"完成"}');
    assert.deepEqual(captured.requestBody?.format, schema);
    assert.deepEqual(captured.requestBody?.options, {
      temperature: 0,
      top_p: 0.9,
      num_ctx: 32768,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
