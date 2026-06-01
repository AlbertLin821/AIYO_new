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

/** Minimum videos required for a bundle to be served as preloaded seed (aligns with seed --min-pass=4). */
export const MIN_PRELOADED_VIDEOS = 3;

export function getPreloadedDataDir(): string {
  return (
    process.env.PRELOADED_DESTINATIONS_DIR?.trim() ||
    path.join(process.cwd(), "data", "preloaded-destinations")
  );
}

function getIndexFile(): string {
  return path.join(getPreloadedDataDir(), "index.json");
}

let cachedBundles: PreloadedDestinationBundle[] | null = null;
let cachedIndexedBundles: PreloadedDestinationBundle[] | null = null;
let loadPromise: Promise<PreloadedDestinationBundle[]> | null = null;
let indexedLoadPromise: Promise<PreloadedDestinationBundle[]> | null = null;

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/臺/g, "台");
}

export function isProductionReadyPreloadedBundle(bundle: PreloadedDestinationBundle): boolean {
  if (bundle.pipelineVersion === "test") {
    return false;
  }
  const validVideos = bundle.videos.filter((video) => {
    const id = (video.videoId || video.id || "").trim();
    return Boolean(id) && id !== "abc123";
  });
  return validVideos.length >= MIN_PRELOADED_VIDEOS;
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

async function loadBundlesFromDisk(options?: { productionOnly?: boolean }): Promise<PreloadedDestinationBundle[]> {
  const productionOnly = options?.productionOnly !== false;
  const dataDir = getPreloadedDataDir();
  const indexFile = getIndexFile();
  try {
    const indexRaw = await readFile(indexFile, "utf8");
    const index = JSON.parse(indexRaw) as PreloadedIndex;
    const bundles: PreloadedDestinationBundle[] = [];
    for (const entry of index.destinations) {
      const filePath = path.join(dataDir, entry.file);
      const raw = await readFile(filePath, "utf8");
      const bundle = JSON.parse(raw) as PreloadedDestinationBundle;
      if (bundle.videos.length === 0) {
        continue;
      }
      if (productionOnly && !isProductionReadyPreloadedBundle(bundle)) {
        continue;
      }
      bundles.push(bundle);
    }
    return bundles;
  } catch {
    return [];
  }
}

async function getIndexedDestinationBundles(): Promise<PreloadedDestinationBundle[]> {
  if (cachedIndexedBundles) {
    return cachedIndexedBundles;
  }
  if (!indexedLoadPromise) {
    indexedLoadPromise = loadBundlesFromDisk({ productionOnly: false }).then((bundles) => {
      cachedIndexedBundles = bundles;
      return bundles;
    });
  }
  return indexedLoadPromise;
}

function findBundleInList(
  bundles: PreloadedDestinationBundle[],
  input: { destination?: string; keyword?: string },
): PreloadedDestinationBundle | null {
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
  cachedIndexedBundles = null;
  loadPromise = null;
  indexedLoadPromise = null;
}

export async function findPreloadedDestinationBundle(input: {
  destination?: string;
  keyword?: string;
}): Promise<PreloadedDestinationBundle | null> {
  const bundles = await getPreloadedDestinationBundles();
  return findBundleInList(bundles, input);
}

/** Resolve destination label from keyword when it matches a preloaded catalog entry. */
export async function resolvePreloadedDestinationHint(input: {
  destination?: string;
  keyword?: string;
}): Promise<string | undefined> {
  const destination = input.destination?.trim();
  if (destination) {
    return destination;
  }
  const bundles = await getIndexedDestinationBundles();
  const bundle = findBundleInList(bundles, { keyword: input.keyword });
  return bundle?.destinationHint;
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
    return id && id !== "abc123" && !excluded.has(id);
  });

  if (filtered.length < MIN_PRELOADED_VIDEOS && offset === 0) {
    return null;
  }

  const slice = filtered.slice(offset, offset + limit);
  return slice.length > 0 ? slice : null;
}
