/**
 * Count video_summary_caches rows grouped by pipeline prefix.
 * Run: cd aiyo && npx tsx scripts/count-video-summary-caches.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import { VIDEO_PIPELINE_VERSION } from "../src/server/services/videoSummaryService";

function loadEnvDev() {
  try {
    const envPath = resolve(process.cwd(), ".env.dev");
    const text = readFileSync(envPath, "utf8");
    for (const line of text.split(/\r?\n/u)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) {
        continue;
      }
      const eq = trimmed.indexOf("=");
      if (eq <= 0) {
        continue;
      }
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // optional
  }
}

loadEnvDev();

async function main() {
  const rows = await prisma.$queryRaw<Array<{ videoId: string }>>`
    SELECT "videoId" FROM "video_summary_caches"
  `;
  const byPrefix = new Map<string, number>();
  for (const row of rows) {
    const prefix = row.videoId.split(":")[0] || "unknown";
    byPrefix.set(prefix, (byPrefix.get(prefix) || 0) + 1);
  }
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        currentPipeline: VIDEO_PIPELINE_VERSION,
        byPrefix: Object.fromEntries([...byPrefix.entries()].sort((a, b) => b[1] - a[1])),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
