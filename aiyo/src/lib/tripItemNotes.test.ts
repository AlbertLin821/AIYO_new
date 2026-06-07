import assert from "node:assert/strict";
import test from "node:test";
import { isCannedTripItemNote, resolveTripItemDisplayNote } from "@/lib/tripItemNotes";

test("isCannedTripItemNote flags fallback template notes", () => {
  assert.equal(isCannedTripItemNote("安排停留 勝烈亭 新市街本店。"), true);
  assert.equal(isCannedTripItemNote("安排在 熊本拉麵黑亭 熊本車站本店 用餐。"), true);
  assert.equal(isCannedTripItemNote("於 熊本市區 一帶安排午餐。"), true);
  assert.equal(isCannedTripItemNote("官方公告顯示部分動線調整。"), false);
});

test("resolveTripItemDisplayNote keeps real model notes only", () => {
  assert.equal(
    resolveTripItemDisplayNote("安排在 勝烈亭 用餐。", "勝烈亭 新市街本店"),
    undefined,
  );
  assert.equal(
    resolveTripItemDisplayNote("YouTube 在地美食影片常見推薦。", "勝烈亭"),
    "YouTube 在地美食影片常見推薦。",
  );
});
