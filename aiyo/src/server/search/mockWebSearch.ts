import type { WebSearchResult } from "@/server/search/searxngClient";

/** Deterministic rows for demos when `AIYO_WEB_SEARCH_MOCK=1` or unified fallback requests mock. */
export function mockWebSearchResults(query: string, limit: number): WebSearchResult[] {
  const q = query.trim() || "旅遊";
  const n = Math.min(10, Math.max(1, limit));
  const rows: WebSearchResult[] = [];
  for (let i = 0; i < n; i += 1) {
    rows.push({
      title: `[Mock ${i + 1}] ${q.slice(0, 48)}${q.length > 48 ? "…" : ""}`,
      url: `https://example.com/mock-search/${encodeURIComponent(q.slice(0, 20))}-${i + 1}`,
      content: `離線示範摘要：與「${q.slice(0, 40)}」相關的示意內容（第 ${i + 1} 筆）。實際環境請設定 Serper、Tavily 或 SearxNG。`,
      engine: "mock",
      score: 0.5,
    });
  }
  return rows;
}
