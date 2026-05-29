import assert from "node:assert/strict";
import test from "node:test";
import { mergeProcessedVideoFields, mergeVideosWithStoredSummaries } from "@/lib/mergeVideoSummaries";
import type { VideoRecommendation } from "@/types";

function baseVideo(overrides: Partial<VideoRecommendation> = {}): VideoRecommendation {
  return {
    id: "v1",
    videoId: "abc123",
    title: "Fresh title from API",
    thumbnail: "https://example.com/new.jpg",
    url: "https://youtu.be/abc123",
    duration: "10:00",
    summary: "Raw description only",
    description: "Raw description only",
    source: "youtube",
    timestamps: [],
    extractedLocations: [],
    ...overrides,
  };
}

test("mergeProcessedVideoFields keeps incoming when stored is not processed", () => {
  const incoming = baseVideo({ title: "Incoming" });
  const stored = baseVideo({ title: "Stored unprocessed" });
  const merged = mergeProcessedVideoFields(incoming, stored);
  assert.equal(merged.title, "Incoming");
  assert.equal(merged.extractedLocations.length, 0);
});

test("mergeProcessedVideoFields preserves processed summary fields from store", () => {
  const incoming = baseVideo({ title: "Incoming", thumbnail: "https://example.com/new.jpg" });
  const stored = baseVideo({
    title: "Old title",
    summary: "Processed summary",
    summarySegments: [{ id: "s1", startSeconds: 0, endSeconds: 10, text: "x", timestamp: "0:00" }],
    extractedLocations: [
      {
        name: "Taipei 101",
        description: "Landmark",
        lat: 25.0,
        lng: 121.5,
        confidence: 0.9,
        verified: true,
      },
    ],
    extractedFoods: ["beef noodle"],
    timestamps: [{ label: "0:00", time: "0:00" }],
  });

  const merged = mergeProcessedVideoFields(incoming, stored);
  assert.equal(merged.title, "Incoming");
  assert.equal(merged.thumbnail, "https://example.com/new.jpg");
  assert.equal(merged.summary, "Processed summary");
  assert.equal(merged.summarySegments?.length, 1);
  assert.equal(merged.extractedLocations[0]?.name, "Taipei 101");
  assert.deepEqual(merged.extractedFoods, ["beef noodle"]);
  assert.equal(merged.timestamps.length, 1);
});

test("mergeVideosWithStoredSummaries merges by videoId", () => {
  const incoming = [
    baseVideo({ videoId: "a", title: "A incoming" }),
    baseVideo({ videoId: "b", title: "B incoming" }),
  ];
  const stored = [
    baseVideo({
      videoId: "a",
      title: "A stored",
      extractedLocations: [
        {
          name: "Spot A",
          description: "",
          lat: 1,
          lng: 2,
          confidence: 0.8,
          verified: true,
        },
      ],
    }),
  ];

  const merged = mergeVideosWithStoredSummaries(incoming, stored);
  assert.equal(merged[0]?.title, "A incoming");
  assert.equal(merged[0]?.extractedLocations[0]?.name, "Spot A");
  assert.equal(merged[1]?.extractedLocations.length, 0);
});
