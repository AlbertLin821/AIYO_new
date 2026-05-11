/**
 * Live／整合情境：嘉義市影片搜尋 + 摘要；輸出 JSON 與 Markdown 報告至 aiyo/tmp。
 * 執行：cd aiyo && npx tsx scripts/test-video-analysis-scenario.ts
 * 需視環境設定 YOUTUBE_API_KEY、GOOGLE_MAPS_API_KEY、OLLAMA_*（不會由此腳本修改 .env）。
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { summarizeVideo } from "@/server/services/videoSummaryService";
import { searchYouTubeVideos } from "@/server/providers/youtubeProvider";

/** 請在 aiyo 目錄下執行此腳本，以便路徑與 tsconfig paths 正確。 */
const ROOT = process.cwd();
const TMP = path.join(ROOT, "tmp");

const QUERY_KEYWORD =
  "嘉義兩天一夜 美食 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯 檜意森活村 北門驛";

/** 常見簡體字巡檢（非完整 Unicode，僅供報告用）。 */
const COMMON_SIMPLIFIED = /(?:这个|适于|台湾(?![\u7063\u706f])|视频|软件|链接)/;

function containsSimplifiedCue(text: string): boolean {
  return COMMON_SIMPLIFIED.test(text);
}

function looksLikeTranscriptDump(text: string): boolean {
  const t = text.trim();
  if (t.length < 60) {
    return false;
  }
  const fillers = /(然後|等一下|這邊|那邊|就是我們|我們現在)/g;
  const hits = t.match(fillers);
  return hits !== null && hits.length >= 4;
}

function segmentsChronological(segments: Array<{ startSeconds?: number }>): boolean {
  const ss = segments.map((s) => s.startSeconds ?? 0);
  for (let i = 1; i < ss.length; i++) {
    if (ss[i] < ss[i - 1]) {
      return false;
    }
  }
  return true;
}

async function main() {
  await mkdir(TMP, { recursive: true });

  const destination = "嘉義市";
  const limit = 5;

  const searchResult = await searchYouTubeVideos({
    destination,
    keyword: QUERY_KEYWORD,
    limit,
  });

  const searchPath = path.join(TMP, "video-analysis-search-results.json");
  await writeFile(
    searchPath,
    JSON.stringify(
      {
        query: { destination, keyword: QUERY_KEYWORD, limit },
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

  const summaries: Array<{
    videoId: string;
    title?: string;
    error?: string;
    result?: Awaited<ReturnType<typeof summarizeVideo>>;
  }> = [];

  for (const video of searchResult.videos) {
    const videoId = video.videoId || "";
    if (!videoId) {
      continue;
    }
    try {
      const result = await summarizeVideo({
        videoId,
        destination,
        title: video.title,
      });
      summaries.push({ videoId, title: video.title, result });
      const singlePath = path.join(TMP, `video-analysis-summary-${videoId}.json`);
      await writeFile(singlePath, JSON.stringify(result, null, 2), "utf8");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      summaries.push({ videoId, title: video.title, error: message });
    }
  }

  const genericRejectHints = [
    "嘉義",
    "嘉義市",
    "嘉義縣",
    "嘉義美食",
    "嘉義景點",
    "嘉義旅遊",
    "嘉義兩天一夜",
    "市區",
    "附近",
    "美食",
    "小吃",
    "景點",
  ];

  const lines: string[] = [];
  lines.push("# 影片分析 Live 檢驗報告");
  lines.push("");
  lines.push(`- 產生時間：${new Date().toISOString()}`);
  lines.push(`- 搜尋目的地：${destination}`);
  lines.push(`- 搜尋關鍵字：${QUERY_KEYWORD}`);
  lines.push(`- YouTube provider：${searchResult.provider}`);
  if (searchResult.fallbackReason) {
    lines.push(`- Provider 備註：${searchResult.fallbackReason}`);
  }
  lines.push("");
  lines.push("## 環境變數檢查");
  lines.push("");
  const envCheck = {
    YOUTUBE_API_KEY: Boolean(process.env.YOUTUBE_API_KEY?.trim()),
    GOOGLE_MAPS_API_KEY: Boolean(process.env.GOOGLE_MAPS_API_KEY?.trim()),
    OLLAMA_BASE_URL: Boolean(process.env.OLLAMA_BASE_URL?.trim()),
    OLLAMA_MODEL: Boolean(process.env.OLLAMA_MODEL?.trim()),
  };
  lines.push("```json");
  lines.push(JSON.stringify(envCheck, null, 2));
  lines.push("```");
  lines.push("");

  lines.push("## 搜尋結果影片");
  lines.push("");
  for (const v of searchResult.videos) {
    lines.push(`- **${v.title || "(無標題)"}** | \`${v.videoId || v.id}\` | 長度 ${v.duration || "?"}`);
  }
  lines.push("");

  for (const item of summaries) {
    lines.push(`## 摘要：${item.videoId}`);
    lines.push("");
    if (item.error) {
      lines.push(`- 錯誤：${item.error}`);
      lines.push("");
      continue;
    }
    const r = item.result;
    if (!r) {
      continue;
    }
    lines.push(`- 標題：${r.title}`);
    lines.push(`- transcriptSource：${r.transcriptSource}`);
    lines.push(`- segmentSource：${r.segmentSource}`);
    lines.push(`- summarySource：${r.summarySource}`);
    if (r.debug) {
      lines.push(`- captionLanguage：${r.debug.captionLanguage ?? "n/a"}`);
      lines.push(`- captionKind：${r.debug.captionKind ?? "n/a"}`);
      lines.push(`- captionSource：${r.debug.captionSource ?? "n/a"}`);
    }
    lines.push(`- mapsProvenance：${r.mapsProvenance ?? "n/a"}`);
    lines.push(`- extractedLocations（名稱）：${r.extractedLocations.join("、") || "（無）"}`);
    lines.push("");
    lines.push("### 泛用地名漏網檢查（extractedLocations）");
    const leaked = genericRejectHints.filter((g) =>
      r.extractedLocations.some((name) => name === g || name.includes(g)),
    );
    if (leaked.length === 0) {
      lines.push("- 命中列表：（無）");
    } else {
      lines.push(`- 疑似漏出：${leaked.join("、")}`);
    }
    lines.push("");
    lines.push("### map-ready 地點（verified／confidence）");
    lines.push("");
    lines.push("| name | verified | confidence | address | placeId |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const loc of r.video.extractedLocations) {
      lines.push(
        `| ${loc.name} | ${loc.verified ?? ""} | ${loc.confidence ?? ""} | ${(loc.address || "").slice(0, 40)} | ${loc.placeId ?? ""} |`,
      );
    }
    lines.push("");
    lines.push("### summarySegments");
    lines.push("");
    const segs = r.segments || [];
    lines.push(`- 時間排序：${segmentsChronological(segs) ? "是" : "否"}`);
    lines.push("");
    for (const seg of segs) {
      const dump = looksLikeTranscriptDump(seg.text || "");
      const simp = containsSimplifiedCue(seg.text || "") || containsSimplifiedCue(seg.title || "");
      lines.push(`- **${seg.timestamp}** ${seg.title || ""}`);
      lines.push(`  - text：${(seg.text || "").slice(0, 120)}${(seg.text || "").length > 120 ? "…" : ""}`);
      lines.push(`  - locationHints：${(seg.locationHints || []).join("、") || "—"}`);
      lines.push(`  - foods：${(seg.foods || []).join("、") || "—"}`);
      lines.push(`  - 疑似逐字稿 dump：${dump ? "是" : "否"}；疑似簡體：${simp ? "是" : "否"}`);
    }
    lines.push("");
  }

  lines.push("## 輸出檔案");
  lines.push("");
  lines.push(`- ${path.relative(ROOT, searchPath)}`);
  for (const item of summaries) {
    if (item.videoId && !item.error) {
      lines.push(`- tmp/video-analysis-summary-${item.videoId}.json`);
    }
  }
  lines.push("");

  const reportPath = path.join(TMP, "video-analysis-report.md");
  await writeFile(reportPath, lines.join("\n"), "utf8");

  console.log(`Wrote ${path.relative(ROOT, reportPath)}`);
  console.log(`Search JSON: ${path.relative(ROOT, searchPath)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
