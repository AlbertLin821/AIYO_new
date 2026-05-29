import { readFile } from "node:fs/promises";
import path from "node:path";

import type { VideoRecommendation } from "@/types";

export type PreloadedDestinationBundle = {
  id: string;
  destinationHint: string;
  searchKeyword: string;
  aliases: string[];
  preferences: string[];
  generatedAt: string;
  pipelineVersion: string;
  videos: VideoRecommendation[];
  validation: {
    requestedCount: number;
    exportedCount: number;
    passCount: number;
    failCount: number;
    errorCount: number;
  };
};

type PreloadedIndex = {
  version: number;
  generatedAt: string;
  destinations: Array<{
    id: string;
    destinationHint: string;
    file: string;
    videoCount: number;
  }>;
};

const DATA_DIR = path.join(process.cwd(), "data", "preloaded-destinations");
const INDEX_FILE = path.join(DATA_DIR, "index.json");

let cachedBundles: PreloadedDestinationBundle[] | null = null;
let loadPromise: Promise<PreloadedDestinationBundle[]> | null = null;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/臺/g, "台");
}

function bundleMatchesQuery(bundle: PreloadedDestinationBundle, rawQuery: string): boolean {
  const q = normalizeToken(rawQuery);
  if (!q) {
    return false;
  }
  const tokens = [
    bundle.id,
    bundle.destinationHint,
    bundle.searchKeyword,
    ...bundle.aliases,
  ]
    .map(normalizeToken)
    .filter(Boolean);

  return tokens.some((token) => q === token || q.includes(token) || token.includes(q));
}

async function loadBundlesFromDisk(): Promise<PreloadedDestinationBundle[]> {
  try {
    const indexRaw = await readFile(INDEX_FILE, "utf8");
    const index = JSON.parse(indexRaw) as PreloadedIndex;
    const bundles: PreloadedDestinationBundle[] = [];
    for (const entry of index.destinations) {
      const filePath = path.join(DATA_DIR, entry.file);
      const raw = await readFile(filePath, "utf8");
      const bundle = JSON.parse(raw) as PreloadedDestinationBundle;
      if (bundle.videos.length > 0) {
        bundles.push(bundle);
      }
    }
    return bundles;
  } catch {
    return [];
  }
}

export async function getPreloadedDestinationBundles(): Promise<PreloadedDestinationBundle[]> {
  if (cachedBundles) {
    return cachedBundles;
  }
  if (!loadPromise) {
    loadPromise = loadBundlesFromDisk().then((bundles) => {
      cachedBundles = bundles;
      return bundles;
    });
  }
  return loadPromise;
}

export function clearPreloadedDestinationCache(): void {
  cachedBundles = null;
  loadPromise = null;
}

export async function findPreloadedDestinationBundle(input: {
  destination?: string;
  keyword?: string;
}): Promise<PreloadedDestinationBundle | null> {
  const bundles = await getPreloadedDestinationBundles();
  if (bundles.length === 0) {
    return null;
  }

  const destination = input.destination?.trim();
  if (destination) {
    const exact = bundles.find(
      (b) =>
        normalizeToken(b.destinationHint) === normalizeToken(destination) ||
        normalizeToken(b.id) === normalizeToken(destination),
    );
    if (exact) {
      return exact;
    }
    const fuzzy = bundles.find((b) => bundleMatchesQuery(b, destination));
    if (fuzzy) {
      return fuzzy;
    }
  }

  const keyword = input.keyword?.trim();
  if (keyword) {
    const match = bundles.find((b) => bundleMatchesQuery(b, keyword));
    if (match) {
      return match;
    }
  }

  return null;
}

export async function getPreloadedDestinationVideos(input: {
  destination?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
  excludeVideoIds?: string[];
}): Promise<VideoRecommendation[] | null> {
  const bundle = await findPreloadedDestinationBundle(input);
  if (!bundle) {
    return null;
  }

  const limit = Math.max(1, Math.min(input.limit || 6, 10));
  const offset = Math.max(0, input.offset || 0);
  const excluded = new Set((input.excludeVideoIds || []).map((id) => id.trim()).filter(Boolean));

  const filtered = bundle.videos.filter((video) => {
    const id = (video.videoId || video.id || "").trim();
    return id && !excluded.has(id);
  });

  const slice = filtered.slice(offset, offset + limit);
  return slice.length > 0 ? slice : null;
}
