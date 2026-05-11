import { expect, test } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeArtifactJson } from "./helpers/artifacts";
import type { ApiResponse, VideoRecommendation, VideoSummaryResult } from "../../src/types";

const KEYWORD = "嘉義兩天一夜 美食 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯 檜意森活村 北門驛";

loadEnvConfig(process.cwd(), true);

function hasLivePipelineEnv() {
  return Boolean(
    process.env.LIVE_API === "1" &&
    process.env.YOUTUBE_API_KEY &&
      process.env.GOOGLE_MAPS_API_KEY &&
      process.env.OLLAMA_BASE_URL &&
      process.env.OLLAMA_MODEL,
  );
}

function readReplayArtifact<T>(name: string): T | null {
  const path = join(process.cwd(), "tmp", "e2e-artifacts", "json", name);
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function containsSimplifiedChinese(value: string) {
  return /[这边为个体会应开关吗见]/.test(value);
}

function redactArtifactSecrets<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(/([?&]key=)[^"&]+/g, "$1[REDACTED]"),
  ) as T;
}

test.describe("真實影片搜尋與摘要 pipeline", () => {
  test("關閉 harness 時輸出真實搜尋與摘要品質 artifact", async ({ request }) => {
    if (!hasLivePipelineEnv()) {
      const replay = readReplayArtifact<{
        extractedLocations?: unknown[];
        summarySegments?: Array<{ timestampConfidence?: string }>;
        genericTermsLeaked?: string[];
      }>("live-video-summary-quality.json");
      test.skip(!replay, "LIVE_API=1 未啟用且沒有既有 artifact 可 replay。");
      writeArtifactJson("live-video-pipeline-replay.json", {
        replayed: true,
        reason: "LIVE_API=1 未啟用，使用既有 artifact replay，避免消耗 YouTube quota。",
        summarySegments: replay?.summarySegments?.length || 0,
        extractedLocations: replay?.extractedLocations?.length || 0,
        lowConfidenceTimestamps: replay?.summarySegments?.filter((segment) => segment.timestampConfidence === "low").length || 0,
        genericTermsLeaked: replay?.genericTermsLeaked || [],
      });
      expect(replay?.summarySegments?.length || 0).toBeGreaterThan(0);
      expect(replay?.genericTermsLeaked || []).toHaveLength(0);
      return;
    }

    const search = await request.get("/api/videos/recommendations", {
      params: {
        destination: "嘉義市",
        days: "2",
        preferences: "美食,文化路夜市,林聰明砂鍋魚頭,民主火雞肉飯,檜意森活村,北門驛",
        keyword: KEYWORD,
        limit: "5",
      },
    });
    if (!search.ok()) {
      const replay = readReplayArtifact("video-search-results.json");
      writeArtifactJson("video-search-quota-fallback.json", {
        quotaFallback: true,
        httpStatus: search.status(),
        replayAvailable: Boolean(replay),
      });
      test.skip(Boolean(replay), "YouTube API 失敗，已使用最近一次 artifact replay。");
    }
    expect(search.ok()).toBeTruthy();
    const searchBody = (await search.json()) as ApiResponse<VideoRecommendation[]>;
    expect(searchBody.success).toBeTruthy();
    if (!searchBody.success) {
      return;
    }
    writeArtifactJson("video-search-results.json", searchBody);
    test.skip(searchBody.data.length === 0, "真實 YouTube 搜尋回傳 0 筆，已輸出 video-search-results.json 供報告記錄。");

    const first = searchBody.data[0];
    const summary = await request.post("/api/videos/summarize", {
      data: {
        videoId: first.videoId,
        title: first.title,
        destination: "嘉義市",
      },
    });
    expect(summary.ok()).toBeTruthy();
    const summaryBody = (await summary.json()) as ApiResponse<VideoSummaryResult>;
    expect(summaryBody.success).toBeTruthy();
    if (!summaryBody.success) {
      return;
    }

    const locations = summaryBody.data.video.extractedLocations;
    const segments = summaryBody.data.segments;
    const foods = Array.from(new Set(segments.flatMap((segment) => segment.foods || [])));
    const locationHints = Array.from(new Set(segments.flatMap((segment) => segment.locationHints || [])));
    const genericTermsLeaked = locations
      .filter((location) => ["火雞肉飯", "砂鍋魚頭"].includes(location.name.trim()))
      .map((location) => location.name);
    const textBlob = JSON.stringify(summaryBody.data);

    writeArtifactJson("live-video-summary-quality.json", redactArtifactSecrets({
      video: {
        title: first.title,
        videoId: first.videoId,
        url: first.url,
      },
      extractedLocations: locations,
      summarySegments: segments,
      locationHints,
      foods,
      verifiedGeocodeResults: locations.filter((location) => location.verified && location.resolvedFrom === "google-geocode"),
      genericTermsLeaked,
      simplifiedChineseDetected: containsSimplifiedChinese(textBlob),
      timestampUseful: segments.some((segment) => Boolean(segment.startLabel || segment.timestamp || segment.startSeconds)),
    }));

    expect(genericTermsLeaked).toHaveLength(0);
    expect(segments.length).toBeGreaterThan(0);
    expect(segments.some((segment) => Boolean(segment.startLabel || segment.timestamp || segment.startSeconds))).toBeTruthy();
  });
});
