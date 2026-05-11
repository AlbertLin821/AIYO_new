import assert from "node:assert/strict";
import test from "node:test";

test("tavilySearch returns parsed results when API succeeds", async () => {
  process.env.TAVILY_API_KEY = "tvly-test";

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        answer: "測試摘要",
        results: [
          { title: "新聞一", url: "https://a.test/1", content: "內容片段", score: 0.9 },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  try {
    const { tavilySearch, formatTavilyForPrompt } = await import("@/server/providers/tavilySearch");
    const res = await tavilySearch({ query: "台南 活動", maxResults: 3 });
    assert.equal(res.ok, true);
    if (!res.ok) {
      return;
    }
    assert.equal(res.answer, "測試摘要");
    assert.equal(res.results.length, 1);
    assert.equal(res.results[0]?.title, "新聞一");
    const formatted = formatTavilyForPrompt(res);
    assert.ok(formatted.includes("測試摘要"));
    assert.ok(formatted.includes("新聞一"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("tavilySearch returns ok false when Tavily HTTP errors or key unset", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ detail: { error: "bad request" } }), { status: 400 }),
  ) as typeof fetch;
  try {
    const { tavilySearch } = await import("@/server/providers/tavilySearch");
    const res = await tavilySearch({ query: "台南 活動" });
    assert.equal(res.ok, false);
    if (res.ok) {
      return;
    }
    assert.match(res.reason, /Tavily HTTP 400|TAVILY_API_KEY is not configured/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
