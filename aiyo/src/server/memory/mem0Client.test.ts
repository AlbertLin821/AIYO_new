import assert from "node:assert/strict";
import test from "node:test";

import { serverConfig } from "@/server/config";
import { listMemories, searchMemories } from "@/server/memory/mem0Client";

test("mem0 client sends X-API-Key when configured", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    mem0Enabled: serverConfig.mem0Enabled,
    mem0ApiKey: serverConfig.mem0ApiKey,
    mem0BaseUrl: serverConfig.mem0BaseUrl,
  };
  const seenHeaders: Record<string, string> = {};

  serverConfig.mem0Enabled = true;
  serverConfig.mem0ApiKey = "test-mem0-key";
  serverConfig.mem0BaseUrl = "http://mem0.local";
  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    headers.forEach((value, key) => {
      seenHeaders[key] = value;
    });
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await searchMemories({ userId: "user_1", query: "大阪" });
    assert.equal(seenHeaders["x-api-key"], "test-mem0-key");
    assert.equal(seenHeaders["content-type"], "application/json");
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.mem0Enabled = originalConfig.mem0Enabled;
    serverConfig.mem0ApiKey = originalConfig.mem0ApiKey;
    serverConfig.mem0BaseUrl = originalConfig.mem0BaseUrl;
  }
});

test("mem0 client omits X-API-Key when blank", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = {
    mem0Enabled: serverConfig.mem0Enabled,
    mem0ApiKey: serverConfig.mem0ApiKey,
    mem0BaseUrl: serverConfig.mem0BaseUrl,
  };
  let seenHeaders = new Headers();

  serverConfig.mem0Enabled = true;
  serverConfig.mem0ApiKey = "";
  serverConfig.mem0BaseUrl = "http://mem0.local";
  globalThis.fetch = async (_input, init) => {
    seenHeaders = new Headers(init?.headers);
    return new Response(JSON.stringify({ results: [] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    await listMemories("user_1");
    assert.equal(seenHeaders.has("X-API-Key"), false);
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.mem0Enabled = originalConfig.mem0Enabled;
    serverConfig.mem0ApiKey = originalConfig.mem0ApiKey;
    serverConfig.mem0BaseUrl = originalConfig.mem0BaseUrl;
  }
});
