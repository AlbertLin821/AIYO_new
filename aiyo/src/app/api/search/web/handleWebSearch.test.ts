import assert from "node:assert/strict";
import test from "node:test";

test("handleWebSearchRequest returns results on success", async () => {
  process.env.WEB_SEARCH_PROVIDER = "serper";
  process.env.SERPER_API_KEY = "serper-test";
  const { handleWebSearchRequest } = await import("@/app/api/search/web/handleWebSearch");
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        organic: [
          {
            title: "嘉義文化路夜市",
            link: "https://example.com/night-market",
            snippet: "附近美食與交通資訊",
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
    assert.equal(result.body.data.provider, "serper");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("handleWebSearchRequest validates empty query", async () => {
  const { handleWebSearchRequest } = await import("@/app/api/search/web/handleWebSearch");
  const result = await handleWebSearchRequest({ query: "   " });
  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }
  assert.equal(result.status, 400);
  assert.equal(result.body.success, false);
});
