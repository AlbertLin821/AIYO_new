import assert from "node:assert/strict";
import test from "node:test";
import type { VideoSummaryResult } from "@/types";
import { resolveTripDestinationScope } from "@/lib/tripDestinationScope";
import {
  buildSummaryCacheKey,
  isAcceptableVideoSummaryCache,
  isCatalogLocationAllowedForVideoScope,
  resolveVideoSummaryDestinationContext,
  VIDEO_PIPELINE_VERSION,
} from "@/server/services/videoSummaryService";

test("summary cache rejects obsolete validation versions even with usable segments", () => {
  const result = {
    segments: [{}],
    debug: { pipelineVersion: VIDEO_PIPELINE_VERSION, failedChunkCount: 0 },
  } as VideoSummaryResult;
  assert.equal(isAcceptableVideoSummaryCache(result), true);
  assert.equal(isAcceptableVideoSummaryCache({
    ...result,
    debug: { ...result.debug!, pipelineVersion: "obsolete-validation" },
  }), false);
  assert.equal(isAcceptableVideoSummaryCache({ ...result, debug: undefined }), false);
});

test("buildSummaryCacheKey is video-intrinsic (no user destination)", () => {
  const key = buildSummaryCacheKey({ videoId: "BAyQ10iPK4M", language: "zh-Hant" });
  assert.equal(key, `${VIDEO_PIPELINE_VERSION}:BAyQ10iPK4M:zh-Hant`);
  assert.equal(key.includes("any-destination"), false);
  assert.equal(key.includes("台灣"), false);
});

test("resolveVideoSummaryDestinationContext prefers New Zealand scope over user Taiwan trip", () => {
  const context = resolveVideoSummaryDestinationContext({
    destinationHint: "台灣臺東縣",
    title: "【皇后鎮必玩景點】皇后鎮市區超好逛｜紐西蘭EP.3",
    description: "Queenstown New Zealand travel vlog",
    transcriptLanguage: "zh-TW",
  });

  assert.equal(context.profile.id, "new-zealand");
  assert.equal(context.destinationHint, "紐西蘭");
  assert.deepEqual(context.destinationScope?.countryCodes, ["NZ"]);
});

test("resolveVideoSummaryDestinationContext infers Japan scope from Hokkaido video metadata", () => {
  const context = resolveVideoSummaryDestinationContext({
    title: "北海道自由行 札幌 小樽 美食景點攻略",
    description: "Hokkaido trip vlog with Sapporo and Otaru highlights",
    transcriptLanguage: "zh-TW",
  });

  assert.equal(context.profile.id, "japan");
  assert.equal(context.destinationHint, "北海道");
  assert.deepEqual(context.destinationScope?.countryCodes, ["JP"]);
});

test("resolveVideoSummaryDestinationContext prefers video Japan scope over conflicting user trip destination", () => {
  const context = resolveVideoSummaryDestinationContext({
    destinationHint: "台灣",
    title: "北海道自由行 札幌 小樽 美食景點攻略",
    description: "Hokkaido trip vlog with Sapporo and Otaru highlights",
    transcriptLanguage: "zh-TW",
  });

  assert.equal(context.profile.id, "japan");
  assert.equal(context.destinationHint, "北海道");
  assert.deepEqual(context.destinationScope?.countryCodes, ["JP"]);
});

test("resolveVideoSummaryDestinationContext keeps aligned user destination when it matches video region", () => {
  const context = resolveVideoSummaryDestinationContext({
    destinationHint: "日本",
    title: "北海道自由行 札幌 小樽",
    transcriptLanguage: "zh-TW",
  });

  assert.equal(context.profile.id, "japan");
  assert.equal(context.destinationHint, "日本");
  assert.deepEqual(context.destinationScope?.countryCodes, ["JP"]);
});

test("isCatalogLocationAllowedForVideoScope rejects Taiwan fallback for Japan scope", () => {
  const japanScope = resolveTripDestinationScope("日本");
  assert.ok(japanScope);

  assert.equal(
    isCatalogLocationAllowedForVideoScope(
      {
        name: "文化路夜市",
        address: "東區文化路, 嘉義市, Taiwan 600",
        description: "嘉義夜市",
      },
      japanScope,
    ),
    false,
  );

  assert.equal(
    isCatalogLocationAllowedForVideoScope(
      {
        name: "Tokyo Tower",
        address: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
        description: "Iconic city observation landmark.",
      },
      japanScope,
    ),
    true,
  );
});
