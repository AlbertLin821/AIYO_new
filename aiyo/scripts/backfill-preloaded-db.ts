/**
 * 補寫缺漏的 video_summary_caches 列（從 tmp 摘要重跑 summarizeVideo）。
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { summarizeVideo } from "@/server/services/videoSummaryService";
import { prisma } from "@/lib/prisma";

const ROOT = process.cwd();
const BENCHMARK_ROOT = path.join(ROOT, "tmp", "benchmark", "global");

const TARGETS: Array<{ destId: string; destinationHint: string; videoId: string }> = [
  { destId: "kyoto", destinationHint: "京都", videoId: "QaoBLbzdz-4" },
  { destId: "hanoi", destinationHint: "河內", videoId: "GBMjTMX-FcE" },
  { destId: "hong-kong", destinationHint: "香港", videoId: "GVp3jxS6LsU" },
  { destId: "macau", destinationHint: "澳門", videoId: "3xTfSvakHUM" },
  { destId: "rome", destinationHint: "羅馬", videoId: "KwUClzEhpXE" },
  { destId: "london", destinationHint: "倫敦", videoId: "NwutTdBi-ic" },
  { destId: "new-york", destinationHint: "紐約", videoId: "ddj-DZb-Ijw" },
];

async function main() {
  for (const t of TARGETS) {
    const summaryPath = path.join(BENCHMARK_ROOT, t.destId, `summary-${t.videoId}.json`);
    let title: string | undefined;
    try {
      const cached = JSON.parse(await readFile(summaryPath, "utf8")) as { title?: string; video?: { title?: string } };
      title = cached.title || cached.video?.title;
    } catch {
      // ignore
    }
    console.log(`[${t.destId}] 重跑 ${t.videoId}...`);
    const result = await summarizeVideo({
      videoId: t.videoId,
      destination: t.destinationHint,
      title,
      refresh: true,
    });
    await readFile(summaryPath, "utf8").catch(async () => {
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(path.join(BENCHMARK_ROOT, t.destId), { recursive: true });
      await writeFile(summaryPath, JSON.stringify(result, null, 2), "utf8");
    });
    console.log(
      `[${t.destId}] 完成 segments=${result.segments.length} locations=${result.extractedLocations.length}`,
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
