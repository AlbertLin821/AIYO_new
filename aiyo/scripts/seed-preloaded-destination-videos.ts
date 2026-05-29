/**
 * 20 目的地 × 6 支：與首頁搜尋相同 pipeline（YouTube 搜尋 + summarizeVideo），
 * 通過品質門檻後匯出至 data/preloaded-destinations/ 並寫入 video_summary_caches。
 *
 * 執行：cd aiyo && npm run seed:preloaded-videos
 * 選項：--only=tokyo,paris --resume --videos-per-dest=6 --delay-ms=2000 --retry-failed
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { summarizeVideo } from "@/server/services/videoSummaryService";
import { searchYouTubeVideos } from "@/server/providers/youtubeProvider";
import {
  filterDestinations,
  getTop20GlobalVideoDestinations,
  type GlobalVideoDestination,
} from "./benchmarks/global-video-destinations";
import { evaluateVideoQuality } from "./benchmarks/videoQualityChecks";
import type { VideoRecommendation } from "@/types";

const ROOT = process.cwd();
const BENCHMARK_ROOT = path.join(ROOT, "tmp", "benchmark", "global");
const SEED_ROOT = path.join(ROOT, "data", "preloaded-destinations");
const PROGRESS_FILE = path.join(SEED_ROOT, "_progress.json");
const PIPELINE_VERSION = "preloaded-seed-v1";

type CliOptions = {
  only: string[];
  resume: boolean;
  videosPerDest: number;
  delayMs: number;
  retryFailed: boolean;
  minPassPerDest: number;
};

type ProgressState = {
  completed: Array<{ destId: string; videoId: string }>;
  updatedAt: string;
};

type VideoRunResult = {
  destId: string;
  destinationHint: string;
  videoId: string;
  title?: string;
  error?: string;
  autoPass?: boolean;
  errors?: string[];
  warnings?: string[];
};

function parseCli(argv: string[]): CliOptions {
  let only: string[] = [];
  let resume = false;
  let videosPerDest = 6;
  let delayMs = 2000;
  let retryFailed = false;
  let minPassPerDest = 4;

  for (const arg of argv) {
    if (arg === "--resume") {
      resume = true;
      continue;
    }
    if (arg === "--retry-failed") {
      retryFailed = true;
      continue;
    }
    if (arg.startsWith("--only=")) {
      only = arg
        .slice("--only=".length)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      continue;
    }
    if (arg.startsWith("--videos-per-dest=")) {
      videosPerDest = Math.max(1, Number.parseInt(arg.slice("--videos-per-dest=".length), 10) || 6);
      continue;
    }
    if (arg.startsWith("--delay-ms=")) {
      delayMs = Math.max(0, Number.parseInt(arg.slice("--delay-ms=".length), 10) || 2000);
      continue;
    }
    if (arg.startsWith("--min-pass=")) {
      minPassPerDest = Math.max(1, Number.parseInt(arg.slice("--min-pass=".length), 10) || 4);
    }
  }

  return { only, resume, videosPerDest, delayMs, retryFailed, minPassPerDest };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function progressKey(destId: string, videoId: string): string {
  return `${destId}::${videoId}`;
}

async function loadProgress(): Promise<Set<string>> {
  try {
    const raw = await readFile(PROGRESS_FILE, "utf8");
    const parsed = JSON.parse(raw) as ProgressState;
    return new Set(parsed.completed.map((c) => progressKey(c.destId, c.videoId)));
  } catch {
    return new Set();
  }
}

async function saveProgress(completed: Set<string>): Promise<void> {
  const completedList = [...completed].map((key) => {
    const [destId, videoId] = key.split("::");
    return { destId, videoId };
  });
  const state: ProgressState = {
    completed: completedList,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(PROGRESS_FILE, JSON.stringify(state, null, 2), "utf8");
}

function enrichVideoFromSummary(
  searchVideo: VideoRecommendation,
  summary: Awaited<ReturnType<typeof summarizeVideo>>,
  destinationHint: string,
): VideoRecommendation {
  const v = summary.video;
  return {
    ...searchVideo,
    ...v,
    videoId: v.videoId || searchVideo.videoId || searchVideo.id,
    id: v.id || searchVideo.id,
    summary: v.summary || summary.summary,
    summarySegments: v.summarySegments || summary.segments,
    extractedLocations: v.extractedLocations?.length
      ? v.extractedLocations
      : summary.video.extractedLocations,
    extractedFoods: v.extractedFoods || summary.extractedFoods,
    listProvenance: "preloaded-destination-seed",
    relevanceReason:
      searchVideo.relevanceReason ||
      `預先驗證的${destinationHint}旅遊影片，含重點片段與地圖標點。`,
  };
}

async function processVideo(
  dest: GlobalVideoDestination,
  video: VideoRecommendation,
  options: CliOptions,
  completed: Set<string>,
): Promise<{ run: VideoRunResult; exportVideo?: VideoRecommendation }> {
  const videoId = video.videoId || video.id || "";
  const run: VideoRunResult = {
    destId: dest.id,
    destinationHint: dest.destinationHint,
    videoId,
    title: video.title,
  };

  if (!videoId) {
    run.error = "missing videoId";
    return { run };
  }

  const destDir = path.join(BENCHMARK_ROOT, dest.id);
  const summaryPath = path.join(destDir, `summary-${videoId}.json`);
  const qualityPath = path.join(destDir, `quality-${videoId}.json`);

  try {
    let result: Awaited<ReturnType<typeof summarizeVideo>>;
    const useCached =
      options.resume && !options.retryFailed && completed.has(progressKey(dest.id, videoId));

    if (useCached) {
      try {
        result = JSON.parse(await readFile(summaryPath, "utf8")) as Awaited<
          ReturnType<typeof summarizeVideo>
        >;
      } catch {
        result = await summarizeVideo({
          videoId,
          destination: dest.destinationHint,
          title: video.title,
        });
        await writeFile(summaryPath, JSON.stringify(result, null, 2), "utf8");
      }
    } else {
      result = await summarizeVideo({
        videoId,
        destination: dest.destinationHint,
        title: video.title,
        refresh: options.retryFailed,
      });
      await writeFile(summaryPath, JSON.stringify(result, null, 2), "utf8");
    }

    const quality = evaluateVideoQuality(result, dest);
    await writeFile(qualityPath, JSON.stringify(quality, null, 2), "utf8");

    run.autoPass = quality.autoPass;
    run.errors = quality.errors;
    run.warnings = quality.warnings;

    if (quality.autoPass) {
      return {
        run,
        exportVideo: enrichVideoFromSummary(video, result, dest.destinationHint),
      };
    }
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
  }

  return { run };
}

async function runDestination(
  dest: GlobalVideoDestination,
  options: CliOptions,
  completed: Set<string>,
  allRuns: VideoRunResult[],
): Promise<void> {
  const destDir = path.join(BENCHMARK_ROOT, dest.id);
  await mkdir(destDir, { recursive: true });

  const searchPath = path.join(destDir, "search.json");
  let searchResult: Awaited<ReturnType<typeof searchYouTubeVideos>>;

  try {
    const existing = await readFile(searchPath, "utf8");
    const parsed = JSON.parse(existing) as {
      query?: { limit?: number };
      videos: VideoRecommendation[];
    };
    if (parsed.videos.length >= options.videosPerDest) {
      searchResult = {
        videos: parsed.videos,
        provider: "youtube-data-api",
      };
      console.log(`[${dest.id}] 使用既有 search.json`);
    } else {
      throw new Error("cache insufficient");
    }
  } catch {
    searchResult = await searchYouTubeVideos({
      destination: dest.destinationHint,
      keyword: dest.searchKeyword,
      limit: options.videosPerDest,
      preferences: ["美食", "景點", "懶人包"],
    });
    await writeFile(
      searchPath,
      JSON.stringify(
        {
          query: {
            destination: dest.destinationHint,
            keyword: dest.searchKeyword,
            limit: options.videosPerDest,
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
    console.log(`[${dest.id}] 搜尋 ${searchResult.videos.length} 支`);
    await sleep(options.delayMs);
  }

  const exported: VideoRecommendation[] = [];
  const runs: VideoRunResult[] = [];

  for (const video of searchResult.videos.slice(0, options.videosPerDest)) {
    const videoId = video.videoId || video.id || "";
    if (!videoId) {
      continue;
    }

    if (options.resume && completed.has(progressKey(dest.id, videoId)) && !options.retryFailed) {
      const summaryPath = path.join(destDir, `summary-${videoId}.json`);
      const qualityPath = path.join(destDir, `quality-${videoId}.json`);
      try {
        const result = JSON.parse(await readFile(summaryPath, "utf8")) as Awaited<
          ReturnType<typeof summarizeVideo>
        >;
        const quality = JSON.parse(await readFile(qualityPath, "utf8")) as {
          autoPass: boolean;
          errors: string[];
          warnings: string[];
        };
        const run: VideoRunResult = {
          destId: dest.id,
          destinationHint: dest.destinationHint,
          videoId,
          title: video.title,
          autoPass: quality.autoPass,
          errors: quality.errors,
          warnings: quality.warnings,
        };
        runs.push(run);
        if (quality.autoPass) {
          exported.push(enrichVideoFromSummary(video, result, dest.destinationHint));
        }
        console.log(`[${dest.id}] 跳過已完成 ${videoId}`);
        continue;
      } catch {
        // fall through to reprocess
      }
    }

    const { run, exportVideo } = await processVideo(dest, video, options, completed);
    runs.push(run);
    allRuns.push(run);
    if (exportVideo) {
      exported.push(exportVideo);
    }
    completed.add(progressKey(dest.id, videoId));
    await saveProgress(completed);
    await sleep(options.delayMs);
  }

  const passCount = runs.filter((r) => r.autoPass).length;
  const failCount = runs.filter((r) => !r.error && !r.autoPass).length;
  const errorCount = runs.filter((r) => r.error).length;
  const requiredPass = Math.min(options.minPassPerDest, options.videosPerDest);

  if (exported.length < requiredPass) {
    console.warn(
      `[${dest.id}] 僅 ${exported.length}/${options.videosPerDest} 支通過品質門檻（需 >= ${requiredPass}），未寫入種子檔。`,
    );
    return;
  }

  const bundle = {
    id: dest.id,
    destinationHint: dest.destinationHint,
    searchKeyword: dest.searchKeyword,
    aliases: [dest.destinationHint, dest.id, dest.region],
    preferences: ["美食", "景點", "懶人包"],
    generatedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    videos: exported.slice(0, options.videosPerDest),
    validation: {
      requestedCount: options.videosPerDest,
      exportedCount: exported.length,
      passCount,
      failCount,
      errorCount,
    },
  };

  await mkdir(SEED_ROOT, { recursive: true });
  const bundlePath = path.join(SEED_ROOT, `${dest.id}.json`);
  await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");
  console.log(`[${dest.id}] 已匯出種子 ${bundle.videos.length} 支 -> ${path.relative(ROOT, bundlePath)}`);
}

async function writeIndex(_destinations: GlobalVideoDestination[]): Promise<void> {
  const entries: Array<{
    id: string;
    destinationHint: string;
    file: string;
    videoCount: number;
  }> = [];

  const files = (await import("node:fs/promises")).readdir(SEED_ROOT);
  const bundleFiles = (await files).filter(
    (f) => f.endsWith(".json") && !["index.json", "seed-report.json", "_progress.json"].includes(f),
  );

  for (const file of bundleFiles) {
    const bundlePath = path.join(SEED_ROOT, file);
    try {
      const raw = await readFile(bundlePath, "utf8");
      const bundle = JSON.parse(raw) as {
        id: string;
        destinationHint: string;
        videos: unknown[];
      };
      if (bundle.videos.length > 0) {
        entries.push({
          id: bundle.id,
          destinationHint: bundle.destinationHint,
          file,
          videoCount: bundle.videos.length,
        });
      }
    } catch {
      // skip missing
    }
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    pipelineVersion: PIPELINE_VERSION,
    destinations: entries,
  };
  await writeFile(path.join(SEED_ROOT, "index.json"), JSON.stringify(index, null, 2), "utf8");
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const destinations = options.only.length
    ? filterDestinations(options.only)
    : getTop20GlobalVideoDestinations();

  if (destinations.length === 0) {
    console.error("沒有符合的目的地。");
    process.exit(1);
  }

  await mkdir(BENCHMARK_ROOT, { recursive: true });
  await mkdir(SEED_ROOT, { recursive: true });

  if (!process.env.YOUTUBE_API_KEY?.trim()) {
    console.warn("警告：未設定 YOUTUBE_API_KEY。");
  }

  const completed = options.resume ? await loadProgress() : new Set<string>();
  const allRuns: VideoRunResult[] = [];

  console.log(
    `種子處理：${destinations.length} 目的地 × ${options.videosPerDest} 支（目標 ${destinations.length * options.videosPerDest} 部）`,
  );

  for (const dest of destinations) {
    await runDestination(dest, options, completed, allRuns);
  }

  await writeIndex(destinations);

  let totalExported = 0;
  for (const dest of destinations) {
    try {
      const raw = await readFile(path.join(SEED_ROOT, `${dest.id}.json`), "utf8");
      const bundle = JSON.parse(raw) as { videos: unknown[] };
      totalExported += bundle.videos.length;
    } catch {
      // skip
    }
  }

  const reportPath = path.join(SEED_ROOT, "seed-report.json");
  await writeFile(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        options,
        destinationCount: destinations.length,
        totalExportedVideos: totalExported,
        targetVideos: destinations.length * options.videosPerDest,
        runs: allRuns,
      },
      null,
      2,
    ),
    "utf8",
  );

  console.log(`完成。已匯出 ${totalExported} 支（目標 ${destinations.length * options.videosPerDest}）。`);
  console.log(`索引：${path.relative(ROOT, path.join(SEED_ROOT, "index.json"))}`);
  console.log(`報告：${path.relative(ROOT, reportPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
