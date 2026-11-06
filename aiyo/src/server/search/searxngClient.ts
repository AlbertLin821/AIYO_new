import { serverConfig } from "@/server/config";
import type { WebSearchOptions, WebSearchResult } from "@/server/search/webSearchTypes";

export async function searchSearxng(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const base = serverConfig.searxngBaseUrl.trim();
  if (!base || !options.query.trim()) return [];
  try {
    const url = new URL("/search", base);
    url.searchParams.set("q", options.query.trim());
    url.searchParams.set("format", "json");
    url.searchParams.set("safesearch", String(options.safeSearch ?? 1));
    if (options.language) url.searchParams.set("language", options.language);
    const response = await fetch(url, { signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!response.ok) return [];
    const payload = await response.json() as { results?: Array<{ title?: string; url?: string; content?: string; engine?: string; publishedDate?: string }> };
    const limit = Math.min(10, Math.max(1, options.limit ?? 5));
    return (payload.results || []).flatMap((row) => {
      const title = row.title?.trim();
      const link = row.url?.trim();
      if (!title || !link) return [];
      try { if (!/^https?:$/.test(new URL(link).protocol)) return []; } catch { return []; }
      return [{ title, url: link, content: (row.content || "").slice(0, 500), engine: `searxng:${row.engine || "unknown"}`, publishedDate: row.publishedDate || null }];
    }).slice(0, limit);
  } catch { return []; }
}
