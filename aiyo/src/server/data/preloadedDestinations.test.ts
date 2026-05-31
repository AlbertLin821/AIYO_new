import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import {
  clearPreloadedDestinationCache,
  findPreloadedDestinationBundle,
  getPreloadedDestinationVideos,
  isProductionReadyPreloadedBundle,
  resolvePreloadedDestinationHint,
  type PreloadedDestinationBundle,
} from "./preloadedDestinations";

let tempDir = "";
const originalEnv = process.env.PRELOADED_DESTINATIONS_DIR;

function makeTestBundle(overrides?: Partial<PreloadedDestinationBundle>): PreloadedDestinationBundle {
  return {
    id: "tokyo",
    destinationHint: "東京",
    searchKeyword: "東京自由行",
    aliases: ["东京"],
    preferences: [],
    generatedAt: new Date().toISOString(),
    pipelineVersion: "test",
    videos: [
      {
        id: "v1",
        videoId: "abc123",
        title: "東京一日遊",
        thumbnail: "",
        url: "https://youtube.com/watch?v=abc123",
        duration: "10:00",
        summary: "測試",
        description: "",
        source: "youtube",
        timestamps: [],
        extractedLocations: [],
      },
    ],
    validation: {
      requestedCount: 6,
      exportedCount: 1,
      passCount: 1,
      failCount: 0,
      errorCount: 0,
    },
    ...overrides,
  };
}

async function writeFixtureBundle(bundle: PreloadedDestinationBundle): Promise<void> {
  await mkdir(tempDir, { recursive: true });
  await writeFile(
    path.join(tempDir, "index.json"),
    JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      destinations: [
        {
          id: bundle.id,
          destinationHint: bundle.destinationHint,
          file: `${bundle.id}.json`,
          videoCount: bundle.videos.length,
        },
      ],
    }),
    "utf8",
  );
  await writeFile(path.join(tempDir, `${bundle.id}.json`), JSON.stringify(bundle), "utf8");
}

before(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "aiyo-preload-test-"));
  process.env.PRELOADED_DESTINATIONS_DIR = tempDir;
  clearPreloadedDestinationCache();
});

after(async () => {
  if (originalEnv === undefined) {
    delete process.env.PRELOADED_DESTINATIONS_DIR;
  } else {
    process.env.PRELOADED_DESTINATIONS_DIR = originalEnv;
  }
  clearPreloadedDestinationCache();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("findPreloadedDestinationBundle matches destination and keyword", async () => {
  await writeFixtureBundle(
    makeTestBundle({
      pipelineVersion: "seed-v1",
      videos: Array.from({ length: 4 }, (_, index) => ({
        id: `v${index}`,
        videoId: `real${index}`,
        title: `東京影片 ${index}`,
        thumbnail: "",
        url: `https://youtube.com/watch?v=real${index}`,
        duration: "10:00",
        summary: "摘要",
        description: "",
        source: "youtube",
        timestamps: [],
        extractedLocations: [],
      })),
    }),
  );
  clearPreloadedDestinationCache();

  const byDest = await findPreloadedDestinationBundle({ destination: "東京" });
  assert.equal(byDest?.id, "tokyo");

  const byKeyword = await findPreloadedDestinationBundle({ keyword: "東京自由行 美食" });
  assert.equal(byKeyword?.id, "tokyo");
});

test("isProductionReadyPreloadedBundle rejects test pipeline and stub video ids", () => {
  assert.equal(isProductionReadyPreloadedBundle(makeTestBundle()), false);
  assert.equal(
    isProductionReadyPreloadedBundle(
      makeTestBundle({
        pipelineVersion: "seed-v1",
        videos: Array.from({ length: 3 }, (_, index) => ({
          id: `v${index}`,
          videoId: `real${index}`,
          title: `東京影片 ${index}`,
          thumbnail: "",
          url: `https://youtube.com/watch?v=real${index}`,
          duration: "10:00",
          summary: "摘要",
          description: "",
          source: "youtube",
          timestamps: [],
          extractedLocations: [],
        })),
      }),
    ),
    true,
  );
});

test("resolvePreloadedDestinationHint resolves from indexed catalog even when bundle is not production-ready", async () => {
  await writeFixtureBundle(makeTestBundle());
  clearPreloadedDestinationCache();

  const hint = await resolvePreloadedDestinationHint({ keyword: "東京自由行" });
  assert.equal(hint, "東京");
});

test("getPreloadedDestinationVideos returns null for under-minimum test bundles", async () => {
  await writeFixtureBundle(makeTestBundle());
  clearPreloadedDestinationCache();

  const videos = await getPreloadedDestinationVideos({ keyword: "東京" });
  assert.equal(videos, null);
});

test("getPreloadedDestinationVideos returns videos for production-ready bundles", async () => {
  await writeFixtureBundle(
    makeTestBundle({
      pipelineVersion: "seed-v1",
      videos: Array.from({ length: 4 }, (_, index) => ({
        id: `v${index}`,
        videoId: `real${index}`,
        title: `東京影片 ${index}`,
        thumbnail: "",
        url: `https://youtube.com/watch?v=real${index}`,
        duration: "10:00",
        summary: "摘要",
        description: "",
        source: "youtube",
        timestamps: [],
        extractedLocations: [],
      })),
    }),
  );
  clearPreloadedDestinationCache();

  const videos = await getPreloadedDestinationVideos({ keyword: "東京", limit: 6 });
  assert.ok(videos);
  assert.equal(videos?.length, 4);
});
