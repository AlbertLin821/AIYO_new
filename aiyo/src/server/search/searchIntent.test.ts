import assert from "node:assert/strict";
import test from "node:test";
import {
  decideSearchIntent,
  formatTravelSearchContextForPrompt,
  shouldUseWebSearch,
  toTravelSearchContext,
} from "@/server/search/searchIntent";

test("shouldUseWebSearch returns true for travel factual queries", () => {
  assert.equal(shouldUseWebSearch("嘉義景點推薦和營業時間"), true);
  assert.equal(shouldUseWebSearch("2026 local events in Tokyo"), true);
  assert.equal(shouldUseWebSearch("這家 restaurant opening hours"), true);
  assert.equal(shouldUseWebSearch("幫我規劃台南三天自由行"), false);
});

test("shouldUseWebSearch returns false for generic chat", () => {
  assert.equal(shouldUseWebSearch("你好，今天心情如何？"), false);
  assert.equal(shouldUseWebSearch("謝謝你"), false);
  assert.equal(shouldUseWebSearch(""), false);
});

test("search decision keeps planning and general advice offline", () => {
  assert.equal(decideSearchIntent({ message: "你好" }).shouldSearch, false);
  assert.equal(decideSearchIntent({ message: "我想去東京玩三天" }).shouldSearch, false);
  assert.equal(decideSearchIntent({ message: "你覺得東京適合第一次自由行嗎" }).shouldSearch, false);
});

test("search decision classifies fresh travel needs", () => {
  const opening = decideSearchIntent({ message: "東京晴空塔今天營業到幾點" });
  assert.equal(opening.shouldSearch, true);
  assert.equal(opening.searchNeed, "opening_hours");
  assert.deepEqual(opening.providers, ["serper", "tavily"]);
  assert.match(opening.query || "", /東京晴空塔/);
  assert.match(opening.query || "", /官方/);

  const events = decideSearchIntent({ message: "京都下週有什麼祭典" });
  assert.equal(events.shouldSearch, true);
  assert.equal(events.searchNeed, "events");

  const transportation = decideSearchIntent({ message: "從淺草到晴空塔怎麼去" });
  assert.equal(transportation.shouldSearch, true);
  assert.equal(transportation.searchNeed, "transportation");
  assert.deepEqual(transportation.providers, ["serper", "tavily"]);
});

test("travel search context caps and formats safe prompt results", () => {
  const context = toTravelSearchContext({
    provider: "serper",
    query: "東京晴空塔 今日 營業時間 官方",
    searchNeed: "opening_hours",
    maxResults: 3,
    results: Array.from({ length: 6 }, (_, index) => ({
      title: index === 5 ? "東京晴空塔 官方網站" : `SEO Blog ${index + 1}`,
      url: index === 5 ? "https://www.tokyo-skytree.jp/" : `https://blog.example.com/${index + 1}`,
      content: `snippet-${index + 1}`,
      engine: "serper",
    })),
  });

  assert.equal(context.results.length, 3);
  assert.equal(context.provider, "serper");
  assert.equal(context.results[0].title, "東京晴空塔 官方網站");
  const prompt = formatTravelSearchContextForPrompt(context);
  assert.match(prompt, /\[搜尋結果\]/);
  assert.doesNotMatch(prompt, /API_KEY|SERPER_API_KEY|TAVILY_API_KEY|searxng/i);
});
