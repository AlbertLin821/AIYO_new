import assert from "node:assert/strict";
import test from "node:test";
import { serverConfig } from "@/server/config";
import { getTravelArticles } from "@/server/services/travelArticlesService";

test("getTravelArticles returns fallback articles when remote sources fail", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("blocked", { status: 403 })) as typeof fetch;

  try {
    const result = await getTravelArticles({ limit: 6 });
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.articles.length >= 4);
    assert.ok(result.articles.some((article) => article.source === "dcard"));
    assert.ok(result.articles.some((article) => article.source === "blog"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getTravelArticles uses query-specific links when sources fail and query is set", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response("blocked", { status: 403 })) as typeof fetch;

  try {
    const result = await getTravelArticles({ query: "台北", limit: 6 });
    assert.equal(result.fallbackUsed, true);
    assert.ok(result.articles.length >= 3);
    assert.ok(
      result.articles.every(
        (article) =>
          article.url.includes("台北") ||
          article.title.includes("台北") ||
          decodeURIComponent(article.url).includes("台北"),
      ),
    );
    assert.ok(
      result.articles.some((article) => article.url.includes("dcard.tw/search/posts")),
    );
    assert.ok(
      !result.articles.some((article) => article.url === "https://www.dcard.tw/f/travel"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getTravelArticles returns dcard post links from serper when dcard api is blocked", async () => {
  const originalFetch = globalThis.fetch;
  const originalSerperKey = serverConfig.serperApiKey;
  serverConfig.serperApiKey = "serper-test";

  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("google.serper.dev")) {
      return Response.json({
        organic: [
          {
            title: "台北一日遊行程分享",
            link: "https://www.dcard.tw/f/travel/p/123456789",
            snippet: "從捷運出發的台北美食與景點動線",
          },
          {
            title: "台北旅遊懶人包",
            link: "https://www.dcard.tw/f/travel/p/987654321",
            snippet: "住宿、交通與必去景點整理",
          },
        ],
      });
    }
    return new Response("blocked", { status: 403 });
  }) as typeof fetch;

  try {
    const result = await getTravelArticles({ query: "台北", limit: 6 });
    assert.ok(result.articles.some((article) => article.url.includes("/f/travel/p/123456789")));
    assert.ok(result.articles.some((article) => article.source === "dcard"));
    assert.ok(!result.articles.some((article) => article.url.includes("/search/posts")));
  } finally {
    globalThis.fetch = originalFetch;
    serverConfig.serperApiKey = originalSerperKey;
  }
});

test("getTravelArticles returns different picks when refreshSeed changes", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/forums/travel/posts")) {
      return Response.json(
        Array.from({ length: 12 }, (_, index) => ({
          id: 1000 + index,
          title: `旅遊文章 ${index + 1}`,
          excerpt: `摘要 ${index + 1}`,
          forumAlias: "travel",
          forumName: "旅遊",
        })),
      );
    }
    if (url.includes(".pixnet.net") || url.includes("backpackers.com.tw")) {
      return new Response(
        `<?xml version="1.0"?><rss><channel>${Array.from({ length: 12 }, (_, index) => `<item><title>RSS ${index + 1}</title><link>https://example.com/rss-${index + 1}</link><description>desc</description></item>`).join("")}</channel></rss>`,
        { status: 200, headers: { "Content-Type": "application/xml" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const first = await getTravelArticles({ limit: 4, refreshSeed: 0 });
    const second = await getTravelArticles({
      limit: 4,
      refreshSeed: 2,
      excludeIds: first.articles.map((article) => article.id),
    });
    assert.equal(first.articles.length, 4);
    assert.equal(second.articles.length, 4);
    const firstIds = new Set(first.articles.map((article) => article.id));
    assert.ok(second.articles.some((article) => !firstIds.has(article.id)));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("getTravelArticles maps dcard json payload", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.includes("/forums/travel/posts") || url.includes("/forums/journey/posts")) {
      return Response.json([
        {
          id: 99,
          title: "京都賞楓 3 日行程分享",
          excerpt: "清水寺、嵐山與錦市場動線整理",
          forumAlias: "travel",
          forumName: "旅遊",
          likeCount: 120,
          commentCount: 18,
          createdAt: "2026-05-01T08:00:00.000Z",
        },
        {
          id: 100,
          title: "釜山美食地圖整理",
          excerpt: "市場、豬肉湯飯與海景咖啡廳",
          forumAlias: "travel",
          forumName: "旅遊",
          likeCount: 88,
          commentCount: 12,
          createdAt: "2026-05-02T08:00:00.000Z",
        },
      ]);
    }
    if (url.includes(".pixnet.net") || url.includes("backpackers.com.tw")) {
      return new Response(
        `<?xml version="1.0"?><rss><channel><item><title>週末快閃台中</title><link>https://example.com/taichung</link><description>兩天一夜路線</description></item><item><title>高雄文青一日遊</title><link>https://example.com/kaohsiung</link><description>駁二與愛河動線</description></item></channel></rss>`,
        { status: 200, headers: { "Content-Type": "application/xml" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const result = await getTravelArticles({ limit: 6 });
    assert.equal(result.fallbackUsed, false);
    assert.ok(result.articles.some((article) => article.id === "dcard-99"));
    assert.ok(result.articles.some((article) => article.url.includes("example.com/taichung")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
