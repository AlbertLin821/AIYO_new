import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";

import {
  clearPreloadedDestinationCache,
  findPreloadedDestinationBundle,
} from "./preloadedDestinations";

const DATA_DIR = path.join(process.cwd(), "data", "preloaded-destinations");

test("findPreloadedDestinationBundle matches destination and keyword", async () => {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(
    path.join(DATA_DIR, "index.json"),
    JSON.stringify({
      version: 1,
      generatedAt: new Date().toISOString(),
      destinations: [{ id: "tokyo", destinationHint: "東京", file: "tokyo.json", videoCount: 1 }],
    }),
    "utf8",
  );
  await writeFile(
    path.join(DATA_DIR, "tokyo.json"),
    JSON.stringify({
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
    }),
    "utf8",
  );

  clearPreloadedDestinationCache();

  const byDest = await findPreloadedDestinationBundle({ destination: "東京" });
  assert.equal(byDest?.id, "tokyo");

  const byKeyword = await findPreloadedDestinationBundle({ keyword: "東京自由行 美食" });
  assert.equal(byKeyword?.id, "tokyo");

  clearPreloadedDestinationCache();
});
