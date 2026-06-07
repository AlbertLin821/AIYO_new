/**
 * Purge stale video_summary_caches rows (old pipeline versions, optional mis-scoped pins).
 *
 * Run:
 *   cd aiyo && npx tsx scripts/purge-video-summary-cache.ts
 *   cd aiyo && npx tsx scripts/purge-video-summary-cache.ts --dry-run
 *   cd aiyo && npx tsx scripts/purge-video-summary-cache.ts --consolidate
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { prisma } from "../src/lib/prisma";
import {
  VIDEO_PIPELINE_VERSION,
  buildSummaryCacheKey,
} from "../src/server/services/videoSummaryService";
import {
  inferCountryCodeFromCoordinates,
  isExplicitDepartureOrForeignPlace,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
} from "../src/lib/tripDestinationScope";
import type { VideoSummaryResult } from "../src/types";

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

const LEGACY_PIPELINE_PREFIXES = [
  "video-simple-ollama-v1",
  "video-simple-ollama-v2",
  "video-simple-ollama-v3",
  "video-quality-v5",
  "video-quality-v6",
  "video-quality-v7",
];

function extractYoutubeIdFromCacheKey(cacheKey: string): string | null {
  const parts = cacheKey.split(":");
  if (parts.length < 3) {
    return null;
  }
  if (parts[0]?.startsWith("video-")) {
    return parts[1]?.trim() || null;
  }
  return null;
}

function isMisScopedVerifiedPin(
  loc: { name?: string; verified?: boolean; lat?: number; lng?: number },
  videoScopeLabel: string,
): boolean {
  if (!loc.verified) {
    return false;
  }
  const lat = loc.lat;
  const lng = loc.lng;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return false;
  }
  const inferred = inferCountryCodeFromCoordinates(lat as number, lng as number);
  if (inferred !== "TW") {
    return false;
  }
  const placeText = loc.name || "";
  if (isExplicitDepartureOrForeignPlace(placeText, "TW")) {
    return false;
  }
  const scope = resolveTripDestinationScope(videoScopeLabel);
  if (!scope) {
    return false;
  }
  return isTextInTripDestinationScope(placeText, scope, { strictCountryLevel: true });
}

function isVideoSummaryResult(value: unknown): value is VideoSummaryResult {
  return Boolean(value && typeof value === "object" && (value as VideoSummaryResult).source === "youtube-summary-service");
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const consolidate = process.argv.includes("--consolidate");

  const rows = await prisma.$queryRaw<Array<{ videoId: string; result: unknown; updatedAt: Date }>>`
    SELECT "videoId", "result", "updatedAt"
    FROM "video_summary_caches"
    ORDER BY "updatedAt" DESC
  `;

  let deleteCount = 0;
  let consolidateCount = 0;

  for (const row of rows) {
    const key = row.videoId;
    const pipelinePrefix = key.split(":")[0] || "";
    const isLegacyPipeline = LEGACY_PIPELINE_PREFIXES.includes(pipelinePrefix);
    const isCurrentPipeline = pipelinePrefix === VIDEO_PIPELINE_VERSION;

    let shouldDelete = isLegacyPipeline;

    if (!shouldDelete && isVideoSummaryResult(row.result)) {
      const locations = row.result.video?.extractedLocations || row.result.extractedLocations || [];
      const title = row.result.title || row.result.video?.title || "";
      const scopeLabel = title.includes("北海道")
        ? "北海道"
        : title.match(/日本|東京|大阪|京都|北海道/u)
          ? "日本"
          : "";
      if (scopeLabel) {
        const misScoped = locations.some((loc) => isMisScopedVerifiedPin(loc, scopeLabel));
        if (misScoped) {
          shouldDelete = true;
        }
      }
    }

    if (shouldDelete) {
      deleteCount += 1;
      if (!dryRun) {
        await prisma.$executeRaw`DELETE FROM "video_summary_caches" WHERE "videoId" = ${key}`;
      }
      console.log(`${dryRun ? "[dry-run] " : ""}delete ${key}`);
      continue;
    }

    if (consolidate && !isCurrentPipeline) {
      const youtubeId = extractYoutubeIdFromCacheKey(key);
      if (!youtubeId || !isVideoSummaryResult(row.result)) {
        continue;
      }
      const canonicalKey = buildSummaryCacheKey({ videoId: youtubeId });
      if (canonicalKey === key) {
        continue;
      }
      consolidateCount += 1;
      if (!dryRun) {
        await prisma.$executeRaw`
          INSERT INTO "video_summary_caches" ("id", "videoId", "result", "updatedAt")
          VALUES (gen_random_uuid()::text, ${canonicalKey}, CAST(${JSON.stringify(row.result)} AS JSONB), NOW())
          ON CONFLICT ("videoId") DO UPDATE SET
            "result" = EXCLUDED."result",
            "updatedAt" = EXCLUDED."updatedAt"
        `;
        await prisma.$executeRaw`DELETE FROM "video_summary_caches" WHERE "videoId" = ${key}`;
      }
      console.log(`${dryRun ? "[dry-run] " : ""}consolidate ${key} -> ${canonicalKey}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        totalRows: rows.length,
        pipelineVersion: VIDEO_PIPELINE_VERSION,
        deleted: deleteCount,
        consolidated: consolidateCount,
        dryRun,
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
