import assert from "node:assert/strict";
import test from "node:test";
import { defaultTaiwanCityVideos, getDefaultTaiwanCityVideos } from "@/data/defaultTaiwanCityVideos";
import type { VideoRecommendation } from "@/types";

const requiredCities = ["台北", "新北", "桃園", "台中", "台南", "高雄"];

function assertVideoRecommendationShape(video: VideoRecommendation) {
  assert.ok(video.id, "id should exist");
  assert.ok(video.videoId, "videoId should exist");
  assert.ok(video.title, "title should exist");
  assert.ok(video.url.startsWith("https://"), "url should be absolute https");
  assert.ok(typeof video.thumbnail === "string", "thumbnail should be string-compatible");
  assert.match(video.duration, /^\d{1,2}:\d{2}(?::\d{2})?$/);
  assert.ok(video.summary, "summary should exist");
  assert.ok(video.description, "description should exist");
  assert.ok(video.source, "source should exist");
  assert.ok(video.channelTitle, "channelTitle should exist");
  assert.ok(video.publishedAt, "publishedAt should exist");
  assert.ok(video.relevanceReason, "relevanceReason should exist");
  assert.ok(Array.isArray(video.timestamps), "timestamps should be array");
  assert.ok(Array.isArray(video.extractedLocations), "extractedLocations should be array");
  assert.ok(Array.isArray(video.summarySegments), "summarySegments should be array");
  assert.equal(video.listProvenance, "default-taiwan-cities");
}

test("default Taiwan city videos cover the six cities and match VideoRecommendation shape", () => {
  const videos = getDefaultTaiwanCityVideos(6);
  assert.equal(videos.length, 6);

  for (const city of requiredCities) {
    assert.ok(
      defaultTaiwanCityVideos.some((video) => video.city === city && video.title.includes(city)),
      `missing default recommendation for ${city}`,
    );
  }

  for (const video of videos) {
    assertVideoRecommendationShape(video);
  }
});

