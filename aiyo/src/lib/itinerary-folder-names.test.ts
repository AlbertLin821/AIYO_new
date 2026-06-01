import assert from "node:assert/strict";
import test from "node:test";
import { isFolderNameDuplicate } from "./itinerary-folder-names";

test("isFolderNameDuplicate matches trimmed case-insensitive names", () => {
  const folders = [
    { id: "a", name: " 日本 " },
    { id: "b", name: "歐洲" },
  ];
  assert.equal(isFolderNameDuplicate(folders, "日本"), true);
  assert.equal(isFolderNameDuplicate(folders, "japan"), false);
  assert.equal(isFolderNameDuplicate(folders, "日本", "a"), false);
  assert.equal(isFolderNameDuplicate(folders, "歐洲"), true);
});
