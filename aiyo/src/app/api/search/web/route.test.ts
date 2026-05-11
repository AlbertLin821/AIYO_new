import assert from "node:assert/strict";
import test from "node:test";

test("POST /api/search/web returns results on success", async () => {
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
    const { POST } = await import("@/app/api/search/web/route");
    const request = new Request("http://localhost/api/search/web", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "嘉義美食景點", limit: 8 }),
    });
    const response = await POST(request);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.success, true);
    assert.equal(body.data.query, "嘉義美食景點");
    assert.equal(Array.isArray(body.data.results), true);
    assert.equal(body.data.results.length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("POST /api/search/web validates empty query", async () => {
  const { POST } = await import("@/app/api/search/web/route");
  const request = new Request("http://localhost/api/search/web", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: "   " }),
  });
  const response = await POST(request);
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.success, false);
});
