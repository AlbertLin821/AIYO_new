/**
 * 全球 26 目的地 × N 支 YouTube 影片：搜尋、summarizeVideo、品質檢查、報告。
 * 執行：cd aiyo && npm run benchmark:global-videos
 * 選項：--only=tokyo,paris --resume --videos-per-dest=6 --delay-ms=2000
 * 不修改專案 env 檔；需 YOUTUBE_API_KEY、GOOGLE_MAPS_API_KEY（建議）。
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { summarizeVideo } from "@/server/services/videoSummaryService";
import { searchYouTubeVideos } from "@/server/providers/youtubeProvider";
import {
  filterDestinations,
  type GlobalVideoDestination,
} from "./benchmarks/global-video-destinations";
import { evaluateVideoQuality } from "./benchmarks/videoQualityChecks";

const ROOT = process.cwd();
const BENCHMARK_ROOT = path.join(ROOT, "tmp", "benchmark", "global");
const PROGRESS_FILE = path.join(BENCHMARK_ROOT, "_progress.json");

type CliOptions = {
  only: string[];
  resume: boolean;
  videosPerDest: number;
  delayMs: number;
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
  transcriptSource?: string;
  segmentSource?: string;
  summarySource?: string;
  extractedLocationCount?: number;
  segmentCount?: number;
};

function parseCli(argv: string[]): CliOptions {
  let only: string[] = [];
  let resume = false;
  let videosPerDest = 6;
  let delayMs = 2000;

  for (const arg of argv) {
    if (arg === "--resume") {
      resume = true;
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
    }
  }

  return { only, resume, videosPerDest, delayMs };
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

async function runDestination(
  dest: GlobalVideoDestination,
  options: CliOptions,
  completed: Set<string>,
  allResults: VideoRunResult[],
): Promise<void> {
  const destDir = path.join(BENCHMARK_ROOT, dest.id);
  await mkdir(destDir, { recursive: true });

  const searchPath = path.join(destDir, "search.json");
  let searchResult: Awaited<ReturnType<typeof searchYouTubeVideos>> | undefined;
  let useCachedSearch = false;

  try {
    const existing = await readFile(searchPath, "utf8");
    const parsed = JSON.parse(existing) as {
      query?: { limit?: number };
      videos: Awaited<ReturnType<typeof searchYouTubeVideos>>["videos"];
      provider?: string;
      fallbackReason?: string;
      debug?: unknown;
    };
    const cachedLimit = parsed.query?.limit ?? parsed.videos.length;
    if (
      parsed.videos.length >= options.videosPerDest &&
      cachedLimit >= options.videosPerDest
    ) {
      searchResult = {
        videos: parsed.videos,
        provider: (parsed.provider as "youtube-data-api") || "youtube-data-api",
        fallbackReason: parsed.fallbackReason,
        debug: parsed.debug as Awaited<ReturnType<typeof searchYouTubeVideos>>["debug"],
      };
      useCachedSearch = true;
      console.log(`[${dest.id}] 使用既有 search.json（${parsed.videos.length} 支）`);
    }
  } catch {
    // no cache
  }

  if (!useCachedSearch) {
    searchResult = await searchYouTubeVideos({
      destination: dest.destinationHint,
      keyword: dest.searchKeyword,
      limit: options.videosPerDest,
    });
    await writeFile(
      searchPath,
      JSON.stringify(
        {
          query: {
            destination: dest.destinationHint,
            keyword: dest.searchKeyword,
            limit: options.videosPerDest,
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
    console.log(`[${dest.id}] 搜尋完成：${searchResult.videos.length} 支`);
    await sleep(options.delayMs);
  }

  if (!searchResult) {
    console.warn(`[${dest.id}] 無可用搜尋結果，略過`);
    return;
  }

  for (const video of searchResult.videos) {
    const videoId = video.videoId || video.id || "";
    if (!videoId) {
      continue;
    }

    const key = progressKey(dest.id, videoId);
    if (options.resume && completed.has(key)) {
      console.log(`[${dest.id}] 跳過已完成 ${videoId}`);
      continue;
    }

    const summaryPath = path.join(destDir, `summary-${videoId}.json`);
    let run: VideoRunResult = {
      destId: dest.id,
      destinationHint: dest.destinationHint,
      videoId,
      title: video.title,
    };

    try {
      let result: Awaited<ReturnType<typeof summarizeVideo>>;
      try {
        const cached = await readFile(summaryPath, "utf8");
        result = JSON.parse(cached) as Awaited<ReturnType<typeof summarizeVideo>>;
        console.log(`[${dest.id}] 使用快取 ${videoId}`);
      } catch {
        result = await summarizeVideo({
          videoId,
          destination: dest.destinationHint,
          title: video.title,
        });
        await writeFile(summaryPath, JSON.stringify(result, null, 2), "utf8");
        console.log(`[${dest.id}] 摘要完成 ${videoId}`);
      }

      const quality = evaluateVideoQuality(result, dest);
      const qualityPath = path.join(destDir, `quality-${videoId}.json`);
      await writeFile(qualityPath, JSON.stringify(quality, null, 2), "utf8");

      run = {
        ...run,
        autoPass: quality.autoPass,
        errors: quality.errors,
        warnings: quality.warnings,
        transcriptSource: result.transcriptSource,
        segmentSource: result.segmentSource,
        summarySource: result.summarySource,
        extractedLocationCount: result.extractedLocations.length,
        segmentCount: (result.segments || []).length,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      run.error = message;
      console.error(`[${dest.id}] 失敗 ${videoId}: ${message}`);
    }

    allResults.push(run);
    completed.add(key);
    await saveProgress(completed);
    await sleep(options.delayMs);
  }
}

function buildMarkdownReport(
  destinations: GlobalVideoDestination[],
  results: VideoRunResult[],
  envCheck: Record<string, boolean>,
): string {
  const lines: string[] = [];
  lines.push("# 全球熱門景點影片 Pipeline 驗證報告");
  lines.push("");
  lines.push(`- 產生時間：${new Date().toISOString()}`);
  lines.push(`- 目的地數：${destinations.length}`);
  lines.push(`- 影片執行數：${results.length}`);
  const passCount = results.filter((r) => r.autoPass === true).length;
  const failCount = results.filter((r) => !r.error && r.autoPass === false).length;
  const errorCount = results.filter((r) => r.error).length;
  lines.push(`- 自動通過：${passCount} | 自動未過：${failCount} | 錯誤：${errorCount}`);
  lines.push("");
  lines.push("## 環境變數");
  lines.push("");
  lines.push("```json");
  lines.push(JSON.stringify(envCheck, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## 總覽");
  lines.push("");
  lines.push("| 目的地 | videoId | 自動 | 錯誤碼 | 警告 | POI 數 | 片段數 |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const r of results) {
    const status = r.error ? "ERR" : r.autoPass ? "PASS" : "FAIL";
    lines.push(
      `| ${r.destinationHint} | ${r.videoId} | ${status} | ${(r.errors || []).join(", ") || "—"} | ${(r.warnings || []).join(", ") || "—"} | ${r.extractedLocationCount ?? "—"} | ${r.segmentCount ?? "—"} |`,
    );
  }
  lines.push("");

  for (const dest of destinations) {
    const destResults = results.filter((r) => r.destId === dest.id);
    if (destResults.length === 0) {
      continue;
    }
    lines.push(`## ${dest.destinationHint}（${dest.id}）`);
    lines.push("");
    lines.push(`- 關鍵字：${dest.searchKeyword}`);
    lines.push(`- 區域：${dest.region}`);
    lines.push("");

    for (const r of destResults) {
      lines.push(`### ${r.title || r.videoId}`);
      lines.push("");
      if (r.error) {
        lines.push(`- 執行錯誤：${r.error}`);
        lines.push("");
        continue;
      }
      lines.push(`- videoId：\`${r.videoId}\``);
      lines.push(`- 自動判定：${r.autoPass ? "通過" : "未通過"}`);
      lines.push(`- transcriptSource：${r.transcriptSource ?? "n/a"}`);
      lines.push(`- segmentSource：${r.segmentSource ?? "n/a"}`);
      lines.push(`- errors：${(r.errors || []).join("、") || "（無）"}`);
      lines.push(`- warnings：${(r.warnings || []).join("、") || "（無）"}`);
      lines.push("");
      lines.push("人工覆核：");
      lines.push("- [ ] 重點片段正確");
      lines.push("- [ ] 地圖標點正確");
      lines.push("- 備註：");
      lines.push("");
    }
  }

  lines.push("## 輸出目錄");
  lines.push("");
  lines.push(`- ${path.relative(ROOT, BENCHMARK_ROOT)}/`);
  lines.push(`- 進度：${path.relative(ROOT, PROGRESS_FILE)}`);
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const options = parseCli(process.argv.slice(2));
  const destinations = filterDestinations(options.only);

  if (destinations.length === 0) {
    console.error("沒有符合 --only 的目的地。可用 id：tokyo, osaka, paris, ...");
    process.exit(1);
  }

  await mkdir(BENCHMARK_ROOT, { recursive: true });

  const envCheck = {
    YOUTUBE_API_KEY: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    GOOGLE_MAPS_API_KEY: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
    OLLAMA_BASE_URL: Boolean(process.env.OLLAMA_BASE_URL?.trim()),
    OLLAMA_MODEL: Boolean(process.env.OLLAMA_MODEL?.trim()),
  };

  if (!envCheck.YOUTUBE_API_KEY) {
    console.warn("警告：未設定 YOUTUBE_API_KEY，搜尋可能失敗。");
  }

  const completed = options.resume ? await loadProgress() : new Set<string>();
  const allResults: VideoRunResult[] = [];

  console.log(
    `開始 benchmark：${destinations.length} 目的地，每地 ${options.videosPerDest} 支，delay ${options.delayMs}ms`,
  );

  for (const dest of destinations) {
    await runDestination(dest, options, completed, allResults);
  }

  const resultsPath = path.join(BENCHMARK_ROOT, "results.json");
  await writeFile(
    resultsPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        options,
        envCheck,
        destinations: destinations.map((d) => d.id),
        results: allResults,
      },
      null,
      2,
    ),
    "utf8",
  );

  const reportMd = buildMarkdownReport(destinations, allResults, envCheck);
  const reportPath = path.join(BENCHMARK_ROOT, "global-video-benchmark-report.md");
  await writeFile(reportPath, reportMd, "utf8");

  console.log(`完成。報告：${path.relative(ROOT, reportPath)}`);
  console.log(`結果 JSON：${path.relative(ROOT, resultsPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
