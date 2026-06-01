/**
 * Rebuild data/preloaded-destinations/index.json from existing bundle JSON files.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = path.join(process.cwd());
const SEED_ROOT = path.join(ROOT, "data", "preloaded-destinations");
const SKIP_FILES = new Set(["index.json", "seed-report.json", "_progress.json"]);

async function main(): Promise<void> {
  const files = (await readdir(SEED_ROOT)).filter(
    (file) => file.endsWith(".json") && !SKIP_FILES.has(file),
  );

  const entries: Array<{
    id: string;
    destinationHint: string;
    file: string;
    videoCount: number;
  }> = [];

  for (const file of files) {
    const filePath = path.join(SEED_ROOT, file);
    try {
      const raw = await readFile(filePath, "utf8");
      const bundle = JSON.parse(raw) as {
        id: string;
        destinationHint: string;
        videos?: unknown[];
        pipelineVersion?: string;
      };
      const videoCount = bundle.videos?.length ?? 0;
      if (videoCount > 0 && bundle.pipelineVersion !== "test") {
        entries.push({
          id: bundle.id,
          destinationHint: bundle.destinationHint,
          file,
          videoCount,
        });
      }
    } catch (error) {
      console.warn(`[rebuild-index] skip ${file}:`, error);
    }
  }

  entries.sort((left, right) => left.id.localeCompare(right.id));

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    destinations: entries,
  };

  await writeFile(path.join(SEED_ROOT, "index.json"), JSON.stringify(index, null, 2), "utf8");
  console.log(`[rebuild-index] wrote ${entries.length} destinations to index.json`);
}

void main();
