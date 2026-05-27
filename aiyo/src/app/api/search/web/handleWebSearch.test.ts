import assert from "node:assert/strict";
import test from "node:test";
import { handleWebSearchRequest } from "@/app/api/search/web/handleWebSearch";

test("handleWebSearchRequest returns results on success", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        results: [
          {
            title: "嘉義文化路夜市",
            url: "https://example.com/night-market",
            content: "附近美食與交通資訊",
            engine: "google",
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const result = await handleWebSearchRequest({ query: "嘉義美食景點", limit: 8 });
    assert.equal(result.ok, true);
    if (!result.ok) {
      return;
    }
    assert.equal(result.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.data.query, "嘉義美食景點");
    assert.equal(Array.isArray(result.body.data.results), true);
    assert.equal(result.body.data.results.length, 1);
    assert.equal(result.body.data.provider, "searxng");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleWebSearchRequest validates empty query", async () => {
  const result = await handleWebSearchRequest({ query: "   " });
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});
