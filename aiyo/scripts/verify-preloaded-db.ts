/**
 * 驗證 preloaded 種子影片是否已寫入 video_summary_caches。
 * 執行：cd aiyo && npx tsx scripts/verify-preloaded-db.ts
 */

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { serverConfig } from "@/server/config";
import { getTop20GlobalVideoDestinations } from "./benchmarks/global-video-destinations";

const SEED_ROOT = path.join(process.cwd(), "data", "preloaded-destinations");

const PIPELINE_VERSION =
  serverConfig.videoExtractionMode === "simple-ollama"
    ? "video-simple-ollama-v2"
    : "video-quality-v7";

function buildCacheKey(videoId: string, destinationHint: string): string {
  return [PIPELINE_VERSION, videoId.trim(), destinationHint.trim() || "any-destination", "zh-Hant"].join(
    ":",
  );
}

type CheckRow = {
  destId: string;
  destinationHint: string;
  videoId: string;
  title: string;
  inSeed: boolean;
  inDb: boolean;
  segmentCount: number;
  locationCount: number;
};

async function loadSeedVideos(): Promise<
  Array<{ destId: string; destinationHint: string; videoId: string; title: string }>
> {
  const files = (await readdir(SEED_ROOT)).filter((f) => f.endsWith(".json") && f !== "index.json" && f !== "seed-report.json" && f !== "_progress.json");
  const out: Array<{ destId: string; destinationHint: string; videoId: string; title: string }> = [];
  for (const file of files) {
    const raw = await readFile(path.join(SEED_ROOT, file), "utf8");
    const bundle = JSON.parse(raw) as {
      id: string;
      destinationHint: string;
      videos: Array<{ videoId?: string; id: string; title: string }>;
    };
    for (const v of bundle.videos ?? []) {
      const videoId = (v.videoId || v.id || "").trim();
      if (videoId) {
        out.push({
          destId: bundle.id,
          destinationHint: bundle.destinationHint,
          videoId,
          title: v.title,
        });
      }
    }
  }
  return out;
}

async function loadProgressVideos(): Promise<
  Array<{ destId: string; destinationHint: string; videoId: string }>
> {
  try {
    const raw = await readFile(path.join(SEED_ROOT, "_progress.json"), "utf8");
    const parsed = JSON.parse(raw) as {
      completed: Array<{ destId: string; videoId: string }>;
    };
    const destById = new Map(getTop20GlobalVideoDestinations().map((d) => [d.id, d.destinationHint]));
    return parsed.completed.map((c) => ({
      destId: c.destId,
      destinationHint: destById.get(c.destId) || c.destId,
      videoId: c.videoId,
    }));
  } catch {
    return [];
  }
}

async function main() {
  const seedVideos = await loadSeedVideos();
  const progressVideos = await loadProgressVideos();

  const allKeys = new Map<string, { destId: string; destinationHint: string; videoId: string; inSeed: boolean; title?: string }>();

  for (const v of progressVideos) {
    const key = buildCacheKey(v.videoId, v.destinationHint);
    allKeys.set(key, { ...v, inSeed: false });
  }
  for (const v of seedVideos) {
    const key = buildCacheKey(v.videoId, v.destinationHint);
    const existing = allKeys.get(key);
    allKeys.set(key, { ...v, inSeed: true, title: v.title || existing?.title });
  }

  const rows: CheckRow[] = [];
  let dbMiss = 0;

  for (const [, entry] of allKeys) {
    const cacheKey = buildCacheKey(entry.videoId, entry.destinationHint);
    const dbRows = await prisma.$queryRaw<Array<{ result: unknown }>>`
      SELECT "result" FROM "video_summary_caches" WHERE "videoId" = ${cacheKey} LIMIT 1
    `;
    const result = dbRows[0]?.result as
      | { segments?: unknown[]; video?: { extractedLocations?: unknown[] } }
      | undefined;
    const inDb = Boolean(result && Array.isArray(result.segments) && result.segments.length > 0);
    if (!inDb) {
      dbMiss += 1;
    }
    rows.push({
      destId: entry.destId,
      destinationHint: entry.destinationHint,
      videoId: entry.videoId,
      title: entry.title || "",
      inSeed: entry.inSeed,
      inDb,
      segmentCount: Array.isArray(result?.segments) ? result.segments.length : 0,
      locationCount: Array.isArray(result?.video?.extractedLocations)
        ? result.video.extractedLocations.length
        : 0,
    });
  }

  const seedInDb = rows.filter((r) => r.inSeed && r.inDb).length;
  const seedTotal = rows.filter((r) => r.inSeed).length;
  const processedInDb = rows.filter((r) => r.inDb).length;
  const processedTotal = rows.length;

  const byDest = new Map<string, { seed: number; seedDb: number; processed: number; processedDb: number }>();
  for (const r of rows) {
    const cur = byDest.get(r.destId) || { seed: 0, seedDb: 0, processed: 0, processedDb: 0 };
    cur.processed += 1;
    if (r.inDb) cur.processedDb += 1;
    if (r.inSeed) {
      cur.seed += 1;
      if (r.inDb) cur.seedDb += 1;
    }
    byDest.set(r.destId, cur);
  }

  const missingDestinations = getTop20GlobalVideoDestinations()
    .filter((d) => !byDest.has(d.id) || byDest.get(d.id)!.seed === 0)
    .map((d) => d.destinationHint);

  console.log(JSON.stringify({
    pipelineVersion: PIPELINE_VERSION,
    seedTotal,
    seedInDb,
    processedTotal,
    processedInDb,
    dbMiss,
    missingSeedDestinations: missingDestinations,
    byDestination: Object.fromEntries(
      [...byDest.entries()].map(([id, v]) => [id, v]),
    ),
    dbMissRows: rows.filter((r) => !r.inDb).map((r) => ({
      destId: r.destId,
      videoId: r.videoId,
      inSeed: r.inSeed,
    })),
  }, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
