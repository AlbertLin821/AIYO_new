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

test("YouTube search can exclude already displayed videos for load-more results", async () => {
  process.env.YOUTUBE_API_KEY = "test-key";
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    const href = String(url);
    if (href.includes("/youtube/v3/search")) {
      return new Response(JSON.stringify({
        items: [
          {
            id: { videoId: "moreVideo1" },
            snippet: {
              title: "台南美食景點三天兩夜旅遊攻略",
              description: "台南赤崁樓、國華街與安平老街自由行旅遊。",
              channelTitle: "旅遊頻道",
              publishedAt: "2026-01-01T00:00:00Z",
              thumbnails: { high: { url: "https://example.test/one.jpg" } },
            },
          },
          {
            id: { videoId: "moreVideo2" },
            snippet: {
              title: "台南安平古蹟與小吃深度旅遊",
              description: "安平古堡、樹屋與台南小吃路線整理。",
              channelTitle: "旅遊頻道",
              publishedAt: "2026-01-02T00:00:00Z",
              thumbnails: { high: { url: "https://example.test/two.jpg" } },
            },
          },
        ],
      }), { status: 200 });
    }
    if (href.includes("/youtube/v3/videos")) {
      return new Response(JSON.stringify({
        items: [
          {
            id: "moreVideo1",
            contentDetails: { duration: "PT12M" },
            snippet: {
              title: "台南美食景點三天兩夜旅遊攻略",
              description: "台南赤崁樓、國華街與安平老街自由行旅遊。",
              channelTitle: "旅遊頻道",
              publishedAt: "2026-01-01T00:00:00Z",
              thumbnails: { high: { url: "https://example.test/one.jpg" } },
            },
          },
          {
            id: "moreVideo2",
            contentDetails: { duration: "PT15M" },
            snippet: {
              title: "台南安平古蹟與小吃深度旅遊",
              description: "安平古堡、樹屋與台南小吃路線整理。",
              channelTitle: "旅遊頻道",
              publishedAt: "2026-01-02T00:00:00Z",
              thumbnails: { high: { url: "https://example.test/two.jpg" } },
            },
          },
        ],
      }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  try {
    const { searchYouTubeVideos } = await import("@/server/providers/youtubeProvider");
    const result = await searchYouTubeVideos({
      destination: "台南",
      keyword: "台南",
      limit: 1,
      excludeVideoIds: ["moreVideo1"],
    });

    assert.equal(result.videos.length, 1);
    assert.equal(result.videos[0].videoId, "moreVideo2");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
