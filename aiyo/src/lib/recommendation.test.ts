import assert from "node:assert/strict";
import test from "node:test";
import { rankRecommendedVideos, scoreVideoRecommendation, type VideoCandidate } from "@/lib/recommendation";

const videos: VideoCandidate[] = [
  {
    videoId: "tainan",
    title: "台南三日遊：美食古蹟文青景點懶人包",
    description: "台南美食、古蹟與巷弄散步",
    publishedAt: new Date().toISOString(),
    viewCount: 500000,
    city: "台南",
    tags: ["台南", "美食", "古蹟", "文青"],
  },
  {
    videoId: "taipei",
    title: "台北一日遊夜市攻略",
    description: "台北捷運景點",
    publishedAt: "2024-01-01T00:00:00.000Z",
    viewCount: 100000,
    city: "台北",
    tags: ["台北", "夜市"],
  },
];

test("scoreVideoRecommendation produces weighted score and breakdown", () => {
  const scored = scoreVideoRecommendation(videos[0], {
    destination: "台南",
    days: 3,
    preferences: ["美食", "古蹟", "文青"],
  });

  assert.equal(scored.scoreBreakdown.destinationScore, 100);
  assert.equal(scored.scoreBreakdown.daysScore, 100);
  assert.equal(scored.scoreBreakdown.preferenceScore, 100);
  assert.ok(scored.score > 90);
});

test("rankRecommendedVideos sorts by score and respects limit", () => {
  const ranked = rankRecommendedVideos(videos, {
    destination: "台南",
    days: 3,
    preferences: ["美食", "古蹟"],
  }, 1);

  assert.equal(ranked.length, 1);
  assert.equal(ranked[0].videoId, "tainan");
});
