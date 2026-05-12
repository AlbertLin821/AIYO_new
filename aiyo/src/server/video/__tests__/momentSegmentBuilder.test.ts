import assert from "node:assert/strict";
import test from "node:test";
import type { VerifiedVideoPlace } from "@/server/video/placeExtraction";
import type { PlaceMention } from "@/server/video/placeMentionExtractor";
import {
  buildMomentSegments,
  buildSegmentsFromVerifiedPlaces,
  pickFirstOccurrenceMentions,
} from "@/server/video/momentSegmentBuilder";

function mention(partial: Partial<PlaceMention> & Pick<PlaceMention, "name" | "startSeconds">): PlaceMention {
  const name = partial.name.trim();
  const normalizedName = (partial.normalizedName ?? name.toLowerCase().replace(/\s+/g, "")).trim();
  return {
    rawText: partial.rawText ?? name,
    name,
    normalizedName,
    startSeconds: partial.startSeconds,
    endSeconds: partial.endSeconds ?? partial.startSeconds + 5,
    context: partial.context ?? "",
    source: partial.source ?? "profile-pattern",
    confidence: partial.confidence ?? 0.7,
    foods: partial.foods,
    sourceTranscriptLineIds: partial.sourceTranscriptLineIds,
    matchedPattern: partial.matchedPattern,
    timestampSource: partial.timestampSource,
    timestampConfidence: partial.timestampConfidence,
  };
}

test("pickFirstOccurrenceMentions keeps earliest timestamp per normalized key", () => {
  const picked = pickFirstOccurrenceMentions([
    mention({ name: "B 店", normalizedName: "b店", startSeconds: 100 }),
    mention({ name: "A 景點", normalizedName: "a景點", startSeconds: 20 }),
    mention({ name: "B店", normalizedName: "b店", startSeconds: 5 }),
  ]);
  assert.equal(picked.length, 2);
  const byTime = [...picked].sort((a, b) => a.startSeconds - b.startSeconds);
  assert.equal(byTime[0].startSeconds, 5);
  assert.equal(byTime[1].startSeconds, 20);
});

test("buildMomentSegments caps segments and preserves foods on first occurrence", () => {
  const segments = buildMomentSegments({
    mentions: [
      mention({ name: "文化路夜市", startSeconds: 10, foods: ["雞肉飯"] }),
      mention({ name: "林聰明砂鍋魚頭", startSeconds: 200 }),
    ],
    videoDurationSeconds: 600,
    maxSegments: 8,
  });
  assert.equal(segments.length, 2);
  assert.deepEqual(segments[0].foods, ["雞肉飯"]);
  assert.match(segments[0].timestamp, /^\d{2}:\d{2}$/);
});

test("toVideoSummarySegments path is covered via buildMomentSegments shape", () => {
  const segments = buildMomentSegments({
    mentions: [mention({ name: "北門驛", startSeconds: 0 })],
    maxSegments: 4,
  });
  assert.equal(segments[0].id, "moment_1");
  assert.equal(segments[0].title, segments[0].locationHints[0]);
});

test("buildSegmentsFromVerifiedPlaces uses verified place names only", () => {
  const places: VerifiedVideoPlace[] = [
    {
      id: "kumamoto-station",
      name: "熊本車站",
      canonicalName: "熊本車站",
      aliases: ["熊本站"],
      source: "gazetteer",
      confidence: 0.9,
      firstMentionStartSeconds: 30,
      firstMentionEndSeconds: 35,
      evidenceTexts: ["熊本站"],
    },
  ];
  const segments = buildSegmentsFromVerifiedPlaces({ places });
  assert.equal(segments.length, 1);
  assert.equal(segments[0].title, "熊本車站");
  assert.deepEqual(segments[0].locationHints, ["熊本車站"]);
  assert.match(segments[0].text, /影片在此時間點提到此地點/);
});
