import assert from "node:assert/strict";
import test from "node:test";
import { serverConfig } from "@/server/config";
import { warmOllamaModel } from "./ollamaModelWarmup";

test("warmup authenticates the configured gateway without leaking its key to a direct backend", async () => {
  const fetchBefore = globalThis.fetch;
  const configBefore = {
    openwebuiBaseUrl: serverConfig.openwebuiBaseUrl,
    openwebuiApiKey: serverConfig.openwebuiApiKey,
    ollamaBaseUrl: serverConfig.ollamaBaseUrl,
  };
  const authorizations: (string | null)[] = [];
  try {
    Object.assign(serverConfig, {
      openwebuiBaseUrl: "http://gateway.test",
      openwebuiApiKey: "test-only-key",
      ollamaBaseUrl: "http://gateway.test/ollama",
    });
    globalThis.fetch = async (_input, init) => {
      assert.equal(JSON.parse(String(init?.body)).prompt, "");
      authorizations.push(new Headers(init?.headers).get("Authorization"));
      return new Response("{}", { status: 200 });
    };
    assert.equal(await warmOllamaModel("test-model"), true);
    serverConfig.ollamaBaseUrl = "http://direct.test:11434";
    assert.equal(await warmOllamaModel("test-model"), true);
    assert.deepEqual(authorizations, ["Bearer test-only-key", null]);
  } finally {
    globalThis.fetch = fetchBefore;
    Object.assign(serverConfig, configBefore);
  }
});
