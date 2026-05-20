import { serverConfig } from "@/server/config";
import type { WebSearchOptions, WebSearchResult } from "@/server/search/searxngClient";

type SerperJson = {
  organic?: Array<{
    title?: string;
    link?: string;
    snippet?: string;
    date?: string;
  }>;
};

export async function searchSerper(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const key = serverConfig.serperApiKey.trim();
  const query = options.query.trim();
  if (!key || !query) {
    return [];
  }

  const limit = Math.min(10, Math.max(1, options.limit ?? serverConfig.aiWebSearchMaxResults));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.max(3_000, serverConfig.searxngTimeoutMs));

  try {
    const response = await fetch("https://google.serper.dev/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-KEY": key,
      },
      body: JSON.stringify({ q: query, num: limit, hl: options.language || "zh-tw" }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) {
      return [];
    }
    const payload = (await response.json()) as SerperJson;
    const rows = (payload.organic || [])
      .map((row): WebSearchResult | null => {
        const title = String(row.title || "").trim();
        const url = String(row.link || "").trim();
        const content = String(row.snippet || "").trim();
        if (!title || !url) {
          return null;
        }
        return {
          title,
          url,
          content: content.slice(0, 500),
          engine: "serper",
          publishedDate: row.date ? String(row.date) : null,
        };
      })
      .filter((row): row is WebSearchResult => row !== null);
    return rows;
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}
