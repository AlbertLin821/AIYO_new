import assert from "node:assert/strict";
import test from "node:test";
import { serverConfig } from "@/server/config";
import { runUnifiedWebSearch, sanitizeAiSearchProviders } from "@/server/search/webSearchService";

test("sanitizeAiSearchProviders filters to serper and tavily only", () => {
  assert.deepEqual(sanitizeAiSearchProviders(["bing", "serper", "tavily"]), ["serper", "tavily"]);
  assert.deepEqual(sanitizeAiSearchProviders(["bing"]), ["serper", "tavily"]);
});

test("runUnifiedWebSearch falls back from serper to tavily", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    provider: serverConfig.webSearchProvider,
    serper: serverConfig.serperApiKey,
    tavily: serverConfig.tavilyApiKey,
  };
  serverConfig.webSearchProvider = "auto";
  serverConfig.serperApiKey = "serper-test";
  serverConfig.tavilyApiKey = "tavily-test";
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("google.serper.dev")) {
      return new Response(JSON.stringify({ organic: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        results: [{ title: "京都祭典官方", url: "https://kyoto.travel/", content: "活動資訊", score: 0.9 }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const result = await runUnifiedWebSearch({
      query: "京都 下週 祭典 官方",
      providers: ["serper", "tavily"],
      limit: 3,
    });
    assert.equal(result.backend, "tavily");
    assert.equal(result.results.length, 1);
    assert.ok(urls.some((url) => url.includes("google.serper.dev")));
    assert.ok(urls.some((url) => url.includes("api.tavily.com")));
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.webSearchProvider = original.provider;
    serverConfig.serperApiKey = original.serper;
    serverConfig.tavilyApiKey = original.tavily;
  }
});

test("runUnifiedWebSearch uses serper when unknown WEB_SEARCH_PROVIDER is configured", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    provider: serverConfig.webSearchProvider,
    serper: serverConfig.serperApiKey,
    tavily: serverConfig.tavilyApiKey,
  };
  serverConfig.webSearchProvider = "bing";
  serverConfig.serperApiKey = "serper-test";
  serverConfig.tavilyApiKey = "";
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({
        organic: [{ title: "官方資訊", link: "https://example.gov.tw/", snippet: "公告" }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const result = await runUnifiedWebSearch({ query: "官方公告", providers: ["serper"], limit: 3 });
    assert.equal(result.backend, "serper");
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.webSearchProvider = original.provider;
    serverConfig.serperApiKey = original.serper;
    serverConfig.tavilyApiKey = original.tavily;
  }
});

test("runUnifiedWebSearch falls back from tavily to serper", async () => {
  const originalFetch = globalThis.fetch;
  const original = {
    provider: serverConfig.webSearchProvider,
    serper: serverConfig.serperApiKey,
    tavily: serverConfig.tavilyApiKey,
  };
  serverConfig.webSearchProvider = "auto";
  serverConfig.serperApiKey = "serper-test";
  serverConfig.tavilyApiKey = "tavily-test";
  const urls: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    urls.push(url);
    if (url.includes("api.tavily.com")) {
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    }
    return new Response(
      JSON.stringify({
        organic: [{ title: "東京晴空塔官方", link: "https://www.tokyo-skytree.jp/", snippet: "營業時間" }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  try {
    const result = await runUnifiedWebSearch({
      query: "東京晴空塔 今日 營業時間 官方",
      providers: ["tavily", "serper"],
      limit: 3,
    });
    assert.equal(result.backend, "serper");
    assert.equal(result.results.length, 1);
    assert.ok(urls.some((url) => url.includes("api.tavily.com")));
    assert.ok(urls.some((url) => url.includes("google.serper.dev")));
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.webSearchProvider = original.provider;
    serverConfig.serperApiKey = original.serper;
    serverConfig.tavilyApiKey = original.tavily;
  }
});
