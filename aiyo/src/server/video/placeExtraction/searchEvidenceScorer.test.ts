import assert from "node:assert/strict";
import test from "node:test";
import { scoreSearchEvidence } from "@/server/video/placeExtraction/searchEvidenceScorer";

test("scoreSearchEvidence accepts strong map/travel evidence", () => {
  const score = scoreSearchEvidence({
    candidateName: "熊本城",
    canonicalName: "熊本城",
    aliases: [],
    destinationHint: "熊本",
    results: [
      {
        title: "熊本城 - Wikipedia",
        url: "https://zh.wikipedia.org/wiki/%E7%86%8A%E6%9C%AC%E5%9F%8E",
        content: "熊本城是熊本著名景點，地址與交通方式整理。",
      },
    ],
  });
  assert.equal(score.accepted, true);
  assert.ok(score.score > 0.5);
});

test("scoreSearchEvidence rejects low-quality social/video style mentions", () => {
  const score = scoreSearchEvidence({
    candidateName: "熊本城",
    canonicalName: "熊本城",
    aliases: [],
    destinationHint: "熊本",
    results: [
      {
        title: "旅遊影片：走路去熊本城",
        url: "https://youtube.com/watch?v=abc",
        content: "走路去熊本城真的很好玩，影片內容轉貼。",
      },
    ],
  });
  assert.equal(score.accepted, false);
});
