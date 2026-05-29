import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  computeHintsOrphanStats,
  evaluateVideoQuality,
  findGenericLeaks,
  isWithinBounds,
  segmentsChronological,
} from "./videoQualityChecks";
import { GLOBAL_VIDEO_DESTINATIONS } from "./global-video-destinations";
import type { VideoSummaryResult } from "@/types";

function minimalResult(overrides: Partial<VideoSummaryResult> = {}): VideoSummaryResult {
  return {
    source: "youtube-summary-service",
    transcriptSource: "youtube",
    summarySource: "heuristic-transcript-fallback",
    segmentSource: "deterministic-mentions",
    title: "測試",
    summary: "測試摘要",
    segments: [
      {
        id: "s1",
        timestamp: "0:00",
        text: "淺草寺",
        title: "淺草寺",
        startSeconds: 0,
        endSeconds: 30,
        locationHints: ["淺草寺"],
      },
      {
        id: "s2",
        timestamp: "1:00",
        text: "晴空塔",
        title: "東京晴空塔",
        startSeconds: 60,
        endSeconds: 90,
        locationHints: ["東京晴空塔"],
      },
    ],
    extractedLocations: ["淺草寺", "東京晴空塔"],
    video: {
      id: "v1",
      videoId: "v1",
      title: "測試",
      thumbnail: "",
      url: "https://youtube.com/watch?v=v1",
      duration: "10:00",
      summary: "",
      description: "",
      source: "youtube",
      timestamps: [],
      extractedLocations: [
        {
          name: "淺草寺",
          lat: 35.7148,
          lng: 139.7967,
          description: "test",
          verified: true,
          confidence: 0.9,
        },
        {
          name: "東京晴空塔",
          lat: 35.7101,
          lng: 139.8107,
          description: "test",
          verified: true,
          confidence: 0.9,
        },
      ],
    },
    ...overrides,
  };
}

describe("videoQualityChecks", () => {
  it("segmentsChronological detects out-of-order", () => {
    assert.equal(
      segmentsChronological([{ startSeconds: 0 }, { startSeconds: 10 }]),
      true,
    );
    assert.equal(
      segmentsChronological([{ startSeconds: 20 }, { startSeconds: 10 }]),
      false,
    );
  });

  it("findGenericLeaks flags exact city-only names only", () => {
    const tokyo = GLOBAL_VIDEO_DESTINATIONS.find((d) => d.id === "tokyo")!;
    const leaks = findGenericLeaks(["東京", "淺草寺", "東京晴空塔"], tokyo.genericRejectHints);
    assert.ok(leaks.includes("東京"));
    assert.ok(!leaks.some((l) => l === "淺草寺" || l === "東京晴空塔"));
  });

  it("isWithinBounds respects country box", () => {
    const tokyo = GLOBAL_VIDEO_DESTINATIONS.find((d) => d.id === "tokyo")!;
    assert.ok(isWithinBounds(35.68, 139.76, tokyo.expectedCountryBounds));
    assert.ok(!isWithinBounds(48.85, 2.35, tokyo.expectedCountryBounds));
  });

  it("computeHintsOrphanStats counts orphan hints", () => {
    const stats = computeHintsOrphanStats(
      [{ locationHints: ["不存在地點"] }, { locationHints: ["淺草寺"] }],
      ["淺草寺"],
    );
    assert.equal(stats.totalSegmentsWithHints, 2);
    assert.equal(stats.orphanSegments, 1);
    assert.equal(stats.orphanRatio, 0.5);
  });

  it("evaluateVideoQuality passes clean tokyo-like result", () => {
    const tokyo = GLOBAL_VIDEO_DESTINATIONS.find((d) => d.id === "tokyo")!;
    const report = evaluateVideoQuality(minimalResult(), tokyo);
    assert.equal(report.autoPass, true);
    assert.equal(report.errors.length, 0);
  });

  it("evaluateVideoQuality fails on generic leak", () => {
    const tokyo = GLOBAL_VIDEO_DESTINATIONS.find((d) => d.id === "tokyo")!;
    const report = evaluateVideoQuality(
      minimalResult({ extractedLocations: ["東京", "淺草寺"] }),
      tokyo,
    );
    assert.equal(report.autoPass, false);
    assert.ok(report.errors.includes("generic_location_leak"));
  });
});
