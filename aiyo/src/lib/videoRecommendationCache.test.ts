import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRecommendationQueryKey,
  isRecommendationCacheFresh,
  VIDEO_RECOMMENDATION_CACHE_TTL_MS,
  type CachedVideoRecommendations,
} from "./videoRecommendationCache";

test("buildRecommendationQueryKey normalizes destination, keyword, and exclude ids", () => {
  const keyA = buildRecommendationQueryKey({
    destination: " 東京 ",
    keyword: " 東京自由行 ",
    days: 5,
    preferences: ["美食", "景點"],
    limit: 6,
    offset: 0,
    excludeVideoIds: ["b", "a"],
  });
  const keyB = buildRecommendationQueryKey({
    destination: "東京",
    keyword: "東京自由行",
    days: 5,
    preferences: ["美食", "景點"],
    limit: 6,
    offset: 0,
    excludeVideoIds: ["a", "b"],
  });
  assert.equal(keyA, keyB);
  assert.match(keyA, /^東京\|東京自由行\|5\|美食,景點\|6\|0\|a,b$/);
});

test("isRecommendationCacheFresh respects TTL window", () => {
  const now = 1_700_000_000_000;
  const fresh: CachedVideoRecommendations = {
    videos: [],
    source: "youtube-data-api",
    fetchedAt: now - VIDEO_RECOMMENDATION_CACHE_TTL_MS + 1_000,
  };
  const stale: CachedVideoRecommendations = {
    videos: [],
    source: "youtube-data-api",
    fetchedAt: now - VIDEO_RECOMMENDATION_CACHE_TTL_MS - 1,
  };
  assert.equal(isRecommendationCacheFresh(fresh, now), true);
  assert.equal(isRecommendationCacheFresh(stale, now), false);
});
