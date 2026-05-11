import assert from "node:assert/strict";
import test from "node:test";

test("same YouTube search query uses memory cache and avoids repeated API calls", async () => {
  process.env.YOUTUBE_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  let fetchCount = 0;
  globalThis.fetch = (async (url: string | URL | Request) => {
    fetchCount += 1;
    const href = String(url);
    if (href.includes("/youtube/v3/search")) {
      return new Response(JSON.stringify({
        items: [{
          id: { videoId: "cacheVideo1" },
          snippet: {
            title: "嘉義兩天一夜 文化路夜市 美食旅遊",
            description: "嘉義市文化路夜市、林聰明砂鍋魚頭與檜意森活村旅遊攻略。",
            channelTitle: "旅遊頻道",
            publishedAt: "2026-01-01T00:00:00Z",
            thumbnails: { high: { url: "https://example.test/thumb.jpg" } },
          },
        }],
      }), { status: 200 });
    }
    if (href.includes("/youtube/v3/videos")) {
      return new Response(JSON.stringify({
        items: [{
          id: "cacheVideo1",
          contentDetails: { duration: "PT10M" },
          snippet: {
            title: "嘉義兩天一夜 文化路夜市 美食旅遊",
            description: "嘉義市文化路夜市、林聰明砂鍋魚頭與檜意森活村旅遊攻略。",
            channelTitle: "旅遊頻道",
            publishedAt: "2026-01-01T00:00:00Z",
            thumbnails: { high: { url: "https://example.test/thumb.jpg" } },
          },
        }],
      }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  try {
    const { searchYouTubeVideos } = await import("@/server/providers/youtubeProvider");
    const input = {
      destination: "嘉義市",
      keyword: "嘉義兩天一夜 文化路夜市",
      limit: 1,
    };
    const first = await searchYouTubeVideos(input);
    const countAfterFirst = fetchCount;
    const second = await searchYouTubeVideos(input);

    assert.equal(first.videos.length, 1);
    assert.equal(second.videos.length, 1);
    assert.equal(fetchCount, countAfterFirst);
    assert.equal(second.debug.cacheStatus, "memory-hit");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
