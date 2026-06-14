import assert from "node:assert/strict";
import test from "node:test";
import { shouldSkipClientVideoSummarize } from "@/services/videoClient";
import type { VideoRecommendation } from "@/types";

function baseVideo(overrides: Partial<VideoRecommendation> = {}): VideoRecommendation {
  return {
    id: "v1",
    videoId: "abc123",
    title: "Test",
    thumbnail: "",
    url: "https://youtu.be/abc123",
    duration: "10:00",
    summary: "Very long description that might look like a summary but is not pipeline output.",
    description: "",
    source: "youtube",
    timestamps: [],
    extractedLocations: [],
    ...overrides,
  };
}

test("should not skip summarize when only summary text is present", () => {
  assert.equal(shouldSkipClientVideoSummarize(baseVideo()), false);
});

test("should skip when summarySegments exist", () => {
  assert.equal(
    shouldSkipClientVideoSummarize(
      baseVideo({
        summarySegments: [
          { id: "s1", startSeconds: 0, endSeconds: 10, text: "x", timestamp: "0:00" },
        ],
      }),
    ),
    true,
  );
});

test("should skip when extractedLocations non-empty", () => {
  assert.equal(
    shouldSkipClientVideoSummarize(
      baseVideo({
        extractedLocations: [
          {
            name: "Foo",
            description: "",
            lat: 0,
            lng: 0,
            confidence: 0.9,
            verified: true,
          },
        ],
      }),
    ),
    true,
  );
});

test("should not skip when only YouTube chapter timestamps are present", () => {
  assert.equal(
    shouldSkipClientVideoSummarize(
      baseVideo({
        timestamps: [{ label: "0:00", time: "0:00" }],
      }),
    ),
    false,
  );
});

test("should skip when videoId missing", () => {
  assert.equal(shouldSkipClientVideoSummarize(baseVideo({ videoId: "" })), true);
});

test("should skip default taiwan cities list", () => {
  assert.equal(
    shouldSkipClientVideoSummarize(baseVideo({ listProvenance: "default-taiwan-cities" })),
    true,
  );
});
