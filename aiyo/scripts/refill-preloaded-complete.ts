/**
 * 補齊 20 目的地預載：每地盡量 6 支、DB 有有效快取、種子 JSON 更新。
 * 執行：cd aiyo && npm run seed:preloaded-videos:refill
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import { serverConfig } from "@/server/config";
import {
  persistVideoSummaryFromInput,
  summarizeVideo,
} from "@/server/services/videoSummaryService";
import { searchYouTubeVideos } from "@/server/providers/youtubeProvider";
import {
  getTop20GlobalVideoDestinations,
  type GlobalVideoDestination,
} from "./benchmarks/global-video-destinations";
import { evaluateVideoQuality } from "./benchmarks/videoQualityChecks";
import type { VideoRecommendation, VideoSummaryResult } from "@/types";

const ROOT = process.cwd();
const BENCHMARK_ROOT = path.join(ROOT, "tmp", "benchmark", "global");
const SEED_ROOT = path.join(ROOT, "data", "preloaded-destinations");

const PIPELINE_VERSION =
  serverConfig.videoExtractionMode === "simple-ollama"
    ? "video-simple-ollama-v2"
    : "video-quality-v7";

type CliOptions = {
  only: string[];
  videosPerDest: number;
  searchPool: number;
  delayMs: number;
  refreshSearch: boolean;
  forceSummarize: boolean;
};

function parseCli(argv: string[]): CliOptions {
  let only: string[] = [];
  let videosPerDest = 6;
  let searchPool = 12;
  let delayMs = 2000;
  let refreshSearch = false;
  let forceSummarize = false;

  for (const arg of argv) {
    if (arg === "--refresh-search") {
      refreshSearch = true;
      continue;
    }
    if (arg === "--force-summarize") {
      forceSummarize = true;
      continue;
    }
    if (arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (arg.startsWith("--videos-per-dest=")) {
      videosPerDest = Math.max(1, Number.parseInt(arg.slice("--videos-per-dest=".length), 10) || 6);
    }
    if (arg.startsWith("--search-pool=")) {
      searchPool = Math.max(videosPerDest, Number.parseInt(arg.slice("--search-pool=".length), 10) || 12);
    }
    if (arg.startsWith("--delay-ms=")) {
      delayMs = Math.max(0, Number.parseInt(arg.slice("--delay-ms=".length), 10) || 2000);
    }
  }

  return { only, videosPerDest, searchPool, delayMs, refreshSearch, forceSummarize };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildCacheKey(videoId: string, destinationHint: string): string {
  return [PIPELINE_VERSION, videoId.trim(), destinationHint.trim() || "any-destination", "zh-Hant"].join(
    ":",
  );
}

async function hasValidDbCache(videoId: string, destinationHint: string): Promise<boolean> {
  const cacheKey = buildCacheKey(videoId, destinationHint);
  const rows = await prisma.$queryRaw<Array<{ result: unknown }>>`
    SELECT "result" FROM "video_summary_caches" WHERE "videoId" = ${cacheKey} LIMIT 1
  `;
  const result = rows[0]?.result as { segments?: unknown[] } | undefined;
  return Boolean(result && Array.isArray(result.segments) && result.segments.length > 0);
}

function enrichVideoFromSummary(
  searchVideo: VideoRecommendation,
  result: VideoSummaryResult,
  destinationHint: string,
): VideoRecommendation {
  const v = result.video;
  return {
    ...searchVideo,
    ...v,
    videoId: v.videoId || searchVideo.videoId || searchVideo.id,
    id: v.id || searchVideo.id,
    summary: v.summary || result.summary,
    summarySegments: v.summarySegments || result.segments,
    extractedLocations: v.extractedLocations?.length
      ? v.extractedLocations
      : result.video.extractedLocations,
    extractedFoods: v.extractedFoods || result.extractedFoods,
    listProvenance: "preloaded-destination-seed",
    relevanceReason:
      searchVideo.relevanceReason ||
      `預先驗證的${destinationHint}旅遊影片，含重點片段與地圖標點。`,
  };
}

async function readSummaryFile(summaryPath: string): Promise<VideoSummaryResult | null> {
  try {
    const raw = await readFile(summaryPath, "utf8");
    const parsed = JSON.parse(raw) as VideoSummaryResult;
    if (parsed.source === "youtube-summary-service" && Array.isArray(parsed.segments)) {
      return parsed;
    }
  } catch {
    // ignore
  }
  return null;
}

async function resolveSummary(
  dest: GlobalVideoDestination,
  video: VideoRecommendation,
  summaryPath: string,
  options: CliOptions,
): Promise<VideoSummaryResult> {
  const videoId = video.videoId || video.id || "";
  const cached = await readSummaryFile(summaryPath);

  if (!options.forceSummarize && cached && cached.segments.length > 0) {
    await persistVideoSummaryFromInput(
      { videoId, destination: dest.destinationHint },
      cached,
    );
    return cached;
  }

  const inDb = await hasValidDbCache(videoId, dest.destinationHint);
  if (!options.forceSummarize && inDb) {
    const fromService = await summarizeVideo({
      videoId,
      destination: dest.destinationHint,
      title: video.title,
      refresh: false,
    });
    if (fromService.segments.length > 0) {
      await writeFile(summaryPath, JSON.stringify(fromService, null, 2), "utf8");
      return fromService;
    }
  }

  const refresh = options.forceSummarize || !cached || cached.segments.length === 0;
  const result = await summarizeVideo({
    videoId,
    destination: dest.destinationHint,
    title: video.title,
    refresh,
  });

  if (result.segments.length > 0) {
    await writeFile(summaryPath, JSON.stringify(result, null, 2), "utf8");
    return result;
  }

  if (cached && cached.segments.length > 0) {
    await persistVideoSummaryFromInput(
      { videoId, destination: dest.destinationHint },
      cached,
    );
    return cached;
  }

  return result;
}

async function loadExistingSeedVideos(destId: string): Promise<VideoRecommendation[]> {
  try {
    const bundle = JSON.parse(
      await readFile(path.join(SEED_ROOT, `${destId}.json`), "utf8"),
    ) as { videos?: VideoRecommendation[] };
    return bundle.videos ?? [];
  } catch {
    return [];
  }
}

async function readCachedSearch(searchPath: string): Promise<VideoRecommendation[]> {
  try {
    const existing = JSON.parse(await readFile(searchPath, "utf8")) as {
      videos: VideoRecommendation[];
    };
    return existing.videos || [];
  } catch {
    return [];
  }
}

async function fetchSearchPool(
  dest: GlobalVideoDestination,
  options: CliOptions,
  forceRefresh: boolean,
): Promise<VideoRecommendation[]> {
  const destDir = path.join(BENCHMARK_ROOT, dest.id);
  await mkdir(destDir, { recursive: true });
  const searchPath = path.join(destDir, "search.json");
  const cached = await readCachedSearch(searchPath);

  if (!forceRefresh && cached.length >= options.videosPerDest) {
    console.log(`[${dest.id}] 使用 search.json（${cached.length} 支）`);
    return cached;
  }

  if (forceRefresh) {
    const searchResult = await searchYouTubeVideos({
      destination: dest.destinationHint,
      keyword: dest.searchKeyword,
      limit: options.searchPool,
      preferences: ["美食", "景點", "懶人包"],
    });

    if (searchResult.videos.length > 0) {
      await writeFile(
        searchPath,
        JSON.stringify(
          {
            query: {
              destination: dest.destinationHint,
              keyword: dest.searchKeyword,
              limit: options.searchPool,
              preferences: ["美食", "景點", "懶人包"],
            },
            provider: searchResult.provider,
            fallbackReason: searchResult.fallbackReason,
            videos: searchResult.videos,
            debug: searchResult.debug,
          },
          null,
          2,
        ),
        "utf8",
      );
      console.log(`[${dest.id}] 新搜尋 ${searchResult.videos.length} 支`);
      return searchResult.videos;
    }

    if (cached.length > 0) {
      console.warn(
        `[${dest.id}] API 搜尋 0 支（可能 quota），改回既有 search.json（${cached.length} 支）`,
      );
      return cached;
    }
    console.warn(`[${dest.id}] 搜尋無結果且無快取`);
    return [];
  }

  if (cached.length > 0) {
    console.log(`[${dest.id}] 使用 search.json（${cached.length} 支）`);
    return cached;
  }

  const searchResult = await searchYouTubeVideos({
    destination: dest.destinationHint,
    keyword: dest.searchKeyword,
    limit: options.searchPool,
    preferences: ["美食", "景點", "懶人包"],
  });

  if (searchResult.videos.length > 0) {
    await writeFile(
      searchPath,
      JSON.stringify(
        {
          query: {
            destination: dest.destinationHint,
            keyword: dest.searchKeyword,
            limit: options.searchPool,
            preferences: ["美食", "景點", "懶人包"],
          },
          provider: searchResult.provider,
          fallbackReason: searchResult.fallbackReason,
          videos: searchResult.videos,
          debug: searchResult.debug,
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  console.log(`[${dest.id}] 搜尋 ${searchResult.videos.length} 支`);
  return searchResult.videos.length > 0 ? searchResult.videos : cached;
}

async function runDestination(
  dest: GlobalVideoDestination,
  options: CliOptions,
): Promise<{ exported: number; target: number }> {
  const forceSearch =
    options.refreshSearch || dest.id === "dubai";
  const pool = await fetchSearchPool(dest, options, forceSearch);
  await sleep(options.delayMs);

  if (pool.length === 0) {
    console.warn(`[${dest.id}] 搜尋無結果，略過`);
    return { exported: 0, target: options.videosPerDest };
  }

  const destDir = path.join(BENCHMARK_ROOT, dest.id);
  const exported: VideoRecommendation[] = [];
  const seen = new Set<string>();

  const existingSeed = await loadExistingSeedVideos(dest.id);
  for (const video of existingSeed) {
    const videoId = (video.videoId || video.id || "").trim();
    if (!videoId || seen.has(videoId)) {
      continue;
    }
    const dbOk = await hasValidDbCache(videoId, dest.destinationHint);
    if (!dbOk) {
      continue;
    }
    seen.add(videoId);
    exported.push(video);
  }
  if (exported.length > 0) {
    console.log(`[${dest.id}] 保留既有種子 ${exported.length} 支（DB 有效）`);
  }

  for (const video of pool) {
    if (exported.length >= options.videosPerDest) {
      break;
    }
    const videoId = (video.videoId || video.id || "").trim();
    if (!videoId || seen.has(videoId)) {
      continue;
    }
    seen.add(videoId);

    const summaryPath = path.join(destDir, `summary-${videoId}.json`);
    const qualityPath = path.join(destDir, `quality-${videoId}.json`);

    try {
      const result = await resolveSummary(dest, video, summaryPath, options);
      const quality = evaluateVideoQuality(result, dest);
      await writeFile(qualityPath, JSON.stringify(quality, null, 2), "utf8");

      const dbOk = await hasValidDbCache(videoId, dest.destinationHint);
      if (!quality.autoPass || result.segments.length === 0 || !dbOk) {
        console.log(
          `[${dest.id}] 略過 ${videoId} pass=${quality.autoPass} segments=${result.segments.length} db=${dbOk}`,
        );
        await sleep(options.delayMs);
        continue;
      }

      exported.push(enrichVideoFromSummary(video, result, dest.destinationHint));
      console.log(`[${dest.id}] 收錄 ${videoId}（${exported.length}/${options.videosPerDest}）`);
    } catch (error) {
      console.error(
        `[${dest.id}] 失敗 ${videoId}:`,
        error instanceof Error ? error.message : String(error),
      );
    }
    await sleep(options.delayMs);
  }

  const minWrite = Math.min(2, options.videosPerDest);
  if (exported.length < minWrite) {
    console.warn(
      `[${dest.id}] 僅 ${exported.length} 支達標（需 >= ${minWrite}），不更新種子檔`,
    );
    return { exported: exported.length, target: options.videosPerDest };
  }

  const bundle = {
    id: dest.id,
    destinationHint: dest.destinationHint,
    searchKeyword: dest.searchKeyword,
    aliases: [dest.destinationHint, dest.id, dest.region],
    preferences: ["美食", "景點", "懶人包"],
    generatedAt: new Date().toISOString(),
    pipelineVersion: "preloaded-seed-v1",
    videos: exported.slice(0, options.videosPerDest),
    validation: {
      requestedCount: options.videosPerDest,
      exportedCount: exported.length,
    },
  };

  await mkdir(SEED_ROOT, { recursive: true });
  await writeFile(path.join(SEED_ROOT, `${dest.id}.json`), JSON.stringify(bundle, null, 2), "utf8");
  console.log(`[${dest.id}] 種子已寫入 ${bundle.videos.length} 支`);

  return { exported: bundle.videos.length, target: options.videosPerDest };
}

async function writeIndex(): Promise<void> {
  const files = (await readdir(SEED_ROOT)).filter(
    (f) =>
      f.endsWith(".json") &&
      !["index.json", "seed-report.json", "_progress.json"].includes(f),
  );
  const entries = [];
  for (const file of files) {
    const bundle = JSON.parse(await readFile(path.join(SEED_ROOT, file), "utf8")) as {
      id: string;
      destinationHint: string;
      videos?: unknown[];
    };
    const videoCount = bundle.videos?.length ?? 0;
    if (videoCount > 0) {
      entries.push({
        id: bundle.id,
        destinationHint: bundle.destinationHint,
        file,
        videoCount,
      });
    }
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  await writeFile(
    path.join(SEED_ROOT, "index.json"),
    JSON.stringify(
      {
        version: 1,
        generatedAt: new Date().toISOString(),
        pipelineVersion: "preloaded-seed-v1",
        destinations: entries,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  let destinations = getTop20GlobalVideoDestinations();
  if (options.only.length) {
    const tokens = options.only.map((t) => t.trim().toLowerCase());
    destinations = destinations.filter(
      (d) =>
        tokens.includes(d.id) ||
        tokens.includes(d.destinationHint.toLowerCase()) ||
        tokens.some((t) => d.id.includes(t)),
    );
  }

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    console.warn("警告：未設定 YOUTUBE_API_KEY");
  }

  console.log(
    `補齊開始：${destinations.length} 目的地，每地目標 ${options.videosPerDest} 支，候選池 ${options.searchPool}`,
  );

  let totalExported = 0;
  let totalTarget = 0;
  const perDest: Record<string, { exported: number; target: number }> = {};

  for (const dest of destinations) {
    const result = await runDestination(dest, options);
    perDest[dest.id] = result;
    totalExported += result.exported;
    totalTarget += result.target;
  }

  await writeIndex();

  const report = {
    generatedAt: new Date().toISOString(),
    options,
    totalExported,
    totalTarget,
    perDest,
  };
  await writeFile(path.join(SEED_ROOT, "refill-report.json"), JSON.stringify(report, null, 2), "utf8");

  console.log(`補齊完成：${totalExported}/${totalTarget} 支已寫入種子`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
