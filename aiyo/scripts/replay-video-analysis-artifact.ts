import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const artifactDir = join(process.cwd(), "tmp", "e2e-artifacts", "json");
const searchPath = join(artifactDir, "video-search-results.json");
const summaryPath = join(artifactDir, "live-video-summary-quality.json");
const outPath = join(artifactDir, "video-analysis-replay-report.json");

function readJson(path: string): unknown {
  if (!existsSync(path)) {
    return null;
  }
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

const search = readJson(searchPath) as { data?: unknown[]; meta?: Record<string, unknown> } | null;
const summary = readJson(summaryPath) as {
  extractedLocations?: Array<{ name?: string; verified?: boolean; geocodeRejectedReason?: string }>;
  summarySegments?: Array<{ timestampConfidence?: string; timestampSource?: string }>;
  genericTermsLeaked?: string[];
} | null;

const locations = summary?.extractedLocations || [];
const report = {
  replayedAt: new Date().toISOString(),
  sourceArtifacts: {
    searchPath,
    summaryPath,
  },
  searchCount: Array.isArray(search?.data) ? search.data.length : 0,
  quotaFallback: JSON.stringify(search?.meta || {}).includes("quota"),
  locationQuality: {
    total: locations.length,
    verified: locations.filter((location) => location.verified).length,
    rejected: locations.filter((location) => location.geocodeRejectedReason).length,
    genericTermsLeaked: summary?.genericTermsLeaked || [],
  },
  timestampConfidence: {
    low: (summary?.summarySegments || []).filter((segment) => segment.timestampConfidence === "low").length,
    descriptionFallback: (summary?.summarySegments || []).filter((segment) => segment.timestampSource === "description-fallback").length,
  },
};

writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(`Replay report written: ${outPath}`);
