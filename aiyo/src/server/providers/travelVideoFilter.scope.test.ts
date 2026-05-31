import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { clearTripDestinationScopeCacheForTests, resolveTripDestinationScope } from "@/lib/tripDestinationScope";
import {
  isInTripDestinationScope,
  isLoosePlaceRelatedVideo,
  isTravelRelatedVideo,
} from "@/server/providers/travelVideoFilter";

afterEach(() => {
  clearTripDestinationScopeCacheForTests();
});

test("JP scope filters New York travel video", () => {
  const scope = resolveTripDestinationScope("日本");
  const meta = {
    title: "New York travel guide 2024",
    description: "Top attractions in Manhattan and Brooklyn.",
    channelTitle: "USA Travel",
  };
  assert.equal(isInTripDestinationScope(meta, scope), false);
  assert.equal(isTravelRelatedVideo(meta, "日本 旅遊", scope), false);
  assert.equal(isLoosePlaceRelatedVideo(meta, "日本", scope), false);
});

test("JP scope keeps Tokyo vlog", () => {
  const scope = resolveTripDestinationScope("日本");
  const meta = {
    title: "東京自由行｜淺草 晴空塔 美食",
    description: "日本關東旅遊 vlog",
    channelTitle: "Japan Trip",
  };
  assert.equal(isInTripDestinationScope(meta, scope), true);
});
