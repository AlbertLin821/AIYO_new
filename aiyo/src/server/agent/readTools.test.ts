import assert from "node:assert/strict";
import { test } from "node:test";
import { explicitPlaceName } from "./readTools";
import { localizedPlaceAlias } from "@/server/places/localizedAliases";

test("provider IDs are resolved only from a user named replacement place", () => {
  assert.equal(explicitPlaceName("把第二天的秋葉原改成新宿", { type: "replace_item", itemId: "old", placeId: "R:17081654", time: "10:00" }), "新宿");
  assert.equal(explicitPlaceName("第二天下午幫我加一個晴空塔，安排在逛街後面。", { type: "add_item", day: 2, placeId: "N:1", time: "16:00", afterItemId: null }), "晴空塔");
  assert.equal(explicitPlaceName("調整一下第二天", { type: "replace_item", itemId: "old", placeId: "R:1", time: "10:00" }), null);
});

test("localized alias only applies in the matching destination", () => {
  assert.equal(localizedPlaceAlias("晴空塔", "東京")?.query, "東京スカイツリー");
  assert.equal(localizedPlaceAlias("晴空塔", "台北"), null);
});
