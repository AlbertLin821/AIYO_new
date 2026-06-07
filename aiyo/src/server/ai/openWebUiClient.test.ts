import assert from "node:assert/strict";
import test from "node:test";

import { chatWithOpenWebUI, listOpenWebUiModels } from "@/server/ai/openWebUiClient";
import { serverConfig } from "@/server/config";

test("chatWithOpenWebUI sends bearer auth and reads OpenAI-compatible content", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = serverConfig.openwebuiBaseUrl;
  const originalApiKey = serverConfig.openwebuiApiKey;
  const captured: { headers?: HeadersInit; body?: Record<string, unknown> } = {};

  serverConfig.openwebuiBaseUrl = "http://open-webui:8080";
  serverConfig.openwebuiApiKey = "sk-test";

  globalThis.fetch = async (_input, init) => {
    captured.headers = init?.headers;
    captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: '{"replyText":"完成"}',
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const raw = await chatWithOpenWebUI({
      format: "json",
      messages: [{ role: "user", content: "請輸出 JSON" }],
      options: { temperature: 0.2, top_p: 0.8 },
    });

    assert.equal(raw, '{"replyText":"完成"}');
    assert.deepEqual(captured.headers, {
      "Content-Type": "application/json",
      Authorization: "Bearer sk-test",
    });
    assert.equal(captured.body?.stream, false);
    assert.equal(captured.body?.temperature, 0.2);
    assert.equal(captured.body?.top_p, 0.8);
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.openwebuiBaseUrl = originalBaseUrl;
    serverConfig.openwebuiApiKey = originalApiKey;
  }
});

test("chatWithOpenWebUI accepts legacy message.content payloads for compatibility", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = serverConfig.openwebuiBaseUrl;

  serverConfig.openwebuiBaseUrl = "http://open-webui:8080";

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ message: { content: "一般文字回覆" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const raw = await chatWithOpenWebUI({
      messages: [{ role: "user", content: "你好" }],
    });
    assert.equal(raw, "一般文字回覆");
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.openwebuiBaseUrl = originalBaseUrl;
  }
});

test("listOpenWebUiModels normalizes array and object payloads", async () => {
  const originalFetch = globalThis.fetch;
  const originalBaseUrl = serverConfig.openwebuiBaseUrl;

  serverConfig.openwebuiBaseUrl = "http://open-webui:8080";

  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      return new Response(JSON.stringify([{ id: "granite4.1:8b" }, { name: "qwen3.5:9b" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ data: [{ model: "mistral-small:24b" }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    assert.deepEqual(await listOpenWebUiModels(), ["granite4.1:8b", "qwen3.5:9b"]);
    assert.deepEqual(await listOpenWebUiModels(), ["mistral-small:24b"]);
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.openwebuiBaseUrl = originalBaseUrl;
  }
});
