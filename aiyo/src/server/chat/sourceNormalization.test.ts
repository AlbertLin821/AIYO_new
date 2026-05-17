import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTavilySources,
  normalizeWeatherSources,
  normalizeYouTubeSources,
  pickCitationIdsForText,
} from "@/server/chat/sourceNormalization";
import type { ChatSource } from "@/types";

function makeSource(source_id: string, title: string, snippet: string): ChatSource {
  return {
    source_id,
    type: "web",
    provider: "test",
    title,
    url: `https://example.com/${source_id}`,
    domain: "example.com",
    snippet,
    preview_text: snippet,
    retrieved_at: new Date().toISOString(),
    reliability: "high",
    language: "zh-TW",
  };
}

test("pickCitationIdsForText returns matched source ids only", () => {
  const citations = pickCitationIdsForText(
    "熊本城夜間點燈",
    {
      src_001: makeSource("src_001", "熊本城點燈攻略", "熊本城夜間點燈時間與交通資訊"),
      src_002: makeSource("src_002", "阿蘇火山散步", "阿蘇山步道與展望台資訊"),
    },
  );

  assert.deepEqual(citations, ["src_001"]);
});

test("pickCitationIdsForText returns empty array when no source matches strongly enough", () => {
  const citations = pickCitationIdsForText(
    "黑川溫泉旅館接駁",
    {
      src_001: makeSource("src_001", "熊本城點燈攻略", "熊本城夜間點燈時間與交通資訊"),
      src_002: makeSource("src_002", "阿蘇火山散步", "阿蘇山步道與展望台資訊"),
    },
  );

  assert.deepEqual(citations, []);
});

test("pickCitationIdsForText prefers requested source types when matches are otherwise similar", () => {
  const citations = pickCitationIdsForText(
    "熊本 降雨機率 20%",
    {
      src_001: {
        ...makeSource("src_001", "熊本旅遊整理", "熊本 降雨機率 20%"),
        type: "web",
      },
      weather_001: {
        ...makeSource("weather_001", "熊本天氣預報", "熊本 降雨機率 20%"),
        type: "weather",
        provider: "open-meteo",
      },
    },
    2,
    { preferredTypes: ["weather"] },
  );

  assert.equal(citations[0], "weather_001");
});

test("normalizeWeatherSources emits weather provider chat sources", () => {
  const sources = normalizeWeatherSources({
    destination: "熊本",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
    lines: [{ date: "2026-10-01", summary: "晴朗", precipProbMax: 20 }],
  });

  const first = Object.values(sources)[0];
  assert.equal(first.type, "weather");
  assert.equal(first.provider, "open-meteo");
  assert.match(first.title, /熊本 天氣預報/);
});

test("normalizeTavilySources classifies official domains as official", () => {
  const sources = normalizeTavilySources([
    {
      title: "熊本市官方祭典公告",
      url: "https://www.city.kumamoto.jp/festival",
      content: "最新祭典公告",
      score: 0.9,
    },
  ]);

  const first = Object.values(sources)[0];
  assert.equal(first.type, "official");
  assert.equal(first.reliability, "high");
});

test("normalizeYouTubeSources emits youtube provider chat sources", () => {
  const sources = normalizeYouTubeSources([
    {
      id: "youtube_1",
      videoId: "abc123",
      title: "熊本兩天一夜 vlog",
      thumbnail: "https://i.ytimg.com/vi/abc123/hqdefault.jpg",
      url: "https://www.youtube.com/watch?v=abc123",
      duration: "12:34",
      summary: "熊本市區與阿蘇路線。",
      description: "旅遊影片",
      source: "youtube-data-api",
      channelTitle: "Travel Lab",
      timestamps: [],
      extractedLocations: [],
      listProvenance: "youtube-data-api",
    },
  ]);

  const first = Object.values(sources)[0];
  assert.equal(first.type, "youtube");
  assert.equal(first.provider, "Travel Lab");
  assert.equal(first.reliability, "high");
});
