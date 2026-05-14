import { existsSync } from "node:fs";
import { serverConfig } from "@/server/config";

export type WebSearchResult = {
  title: string;
  url: string;
  content: string;
  engine?: string;
  score?: number;
  publishedDate?: string | null;
};

export type WebSearchOptions = {
  query: string;
  language?: string;
  categories?: string;
  limit?: number;
  safeSearch?: number;
};

type SearxngJson = {
  results?: SearxngResultRow[];
};

type SearxngResultRow = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  engine?: unknown;
  score?: unknown;
  publishedDate?: unknown;
  publishedDateText?: unknown;
};

function isLikelyDockerRuntime(): boolean {
  return existsSync("/.dockerenv");
}

function resolveSearxngBaseUrl(): string {
  if (isLikelyDockerRuntime()) {
    return serverConfig.searxngInternalBaseUrl.replace(/\/+$/, "");
  }
  return serverConfig.searxngBaseUrl.replace(/\/+$/, "");
}

function normalizeResult(row: SearxngResultRow | undefined): WebSearchResult | null {
  if (!row) {
    return null;
  }
  const title = String(row.title || "").trim();
  const url = String(row.url || "").trim();
  const content = String(row.content || "").trim();
  if (!title || !url) {
    return null;
  }
  const score = Number(row.score);
  const publishedDateRaw = row.publishedDate ?? row.publishedDateText ?? null;
  return {
    title,
    url,
    content: content.slice(0, 500),
    engine: row.engine ? String(row.engine) : undefined,
    score: Number.isFinite(score) ? score : undefined,
    publishedDate: publishedDateRaw ? String(publishedDateRaw) : null,
  };
}

function normalizeSearxngLanguage(language: string | undefined): string {
  const value = (language || serverConfig.searxngDefaultLanguage || "zh-TW").trim();
  if (!value) {
    return "zh-TW";
  }
  // SearxNG validates IETF language tags (zh-TW), while some older configs used zh_TW.
  return value.replace(/^([a-z]{2})_([A-Z]{2})$/, "$1-$2");
}

export async function searchWeb(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const query = options.query.trim();
  if (!serverConfig.searxngEnabled || !query) {
    return [];
  }

  const limit = Math.min(
    10,
    Math.max(1, options.limit ?? serverConfig.searxngResultLimit ?? 8),
  );
  const params = new URLSearchParams({
    q: query,
    format: "json",
    language: normalizeSearxngLanguage(options.language),
    categories: options.categories || serverConfig.searxngDefaultCategories,
    safesearch: String(options.safeSearch ?? serverConfig.searxngSafeSearch ?? 1),
  });

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    Math.max(2_000, serverConfig.searxngTimeoutMs),
  );

  try {
    const baseUrl = resolveSearxngBaseUrl();
    const response = await fetch(`${baseUrl}/search?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`SearXNG HTTP ${response.status}`);
    }
    const payload = (await response.json()) as SearxngJson;
    const normalized = (payload.results || [])
      .map((row) => normalizeResult(row))
      .filter((row): row is WebSearchResult => Boolean(row))
      .slice(0, limit);
    return normalized;
  } catch {
    // Search is best-effort only; callers handle fallback behavior.
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
