import assert from "node:assert/strict";
import test from "node:test";

test("searchWeb normalizes results and filters empty rows", async () => {
  process.env.SEARXNG_ENABLED = "true";
  process.env.SEARXNG_BASE_URL = "http://localhost:8081";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("X-Forwarded-For"), "127.0.0.1");
    assert.equal(headers.get("X-Real-IP"), "127.0.0.1");

    return new Response(
      JSON.stringify({
        results: [
          {
            title: "阿里山森林遊樂區",
            url: "https://example.com/alishan",
            content: "最新門票與交通資訊",
            engine: "duckduckgo",
            score: 0.81,
          },
          {
            title: "",
            url: "https://example.com/invalid",
            content: "should be dropped",
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const { searchWeb } = await import("@/server/search/searxngClient");
    const rows = await searchWeb({ query: "阿里山 門票", limit: 8 });
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.title, "阿里山森林遊樂區");
    assert.equal(rows[0]?.engine, "duckduckgo");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("searchWeb returns [] for empty query", async () => {
  const { searchWeb } = await import("@/server/search/searxngClient");
  const rows = await searchWeb({ query: "   " });
  assert.deepEqual(rows, []);
});

test("searchWeb returns [] when timeout or request failure occurs", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("network timeout");
  }) as typeof fetch;

  try {
    const { searchWeb } = await import("@/server/search/searxngClient");
    const rows = await searchWeb({ query: "嘉義美食", limit: 5 });
    assert.deepEqual(rows, []);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
