import { serverConfig } from "@/server/config";
import { tavilySearch } from "@/server/providers/tavilySearch";
import { mockWebSearchResults } from "@/server/search/mockWebSearch";
import { searchSerper } from "@/server/search/serperClient";
import { searchWeb } from "@/server/search/searxngClient";
import type { WebSearchOptions, WebSearchResult } from "@/server/search/searxngClient";

export type WebSearchBackend = "searxng" | "serper" | "tavily" | "mock" | "none";

export type UnifiedWebSearchResult = {
  results: WebSearchResult[];
  backend: WebSearchBackend;
};

const ALLOWED = new Set(["auto", "searxng", "serper", "tavily", "mock"]);

function resolveBackendOrder(): WebSearchBackend[] {
  const order: WebSearchBackend[] = [];
  if (serverConfig.serperApiKey.trim()) {
    order.push("serper");
  }
  if (serverConfig.tavilyApiKey.trim()) {
    order.push("tavily");
  }
  if (serverConfig.searxngEnabled) {
    order.push("searxng");
  }
  if (serverConfig.aiWebSearchMock) {
    order.push("mock");
  }
  return order.length > 0 ? order : ["none"];
}

async function searchTavilyAsWeb(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const res = await tavilySearch({
    query: options.query,
    maxResults: options.limit ?? serverConfig.aiWebSearchMaxResults,
  });
  if (!res.ok) {
    return [];
  }
  return res.results.map((row) => ({
    title: row.title,
    url: row.url,
    content: row.content.slice(0, 500),
    engine: "tavily",
    score: row.score,
  }));
}

/**
 * Single unified web search for BFF `/api/search/web` and `travelPlannerService` supplementary research.
 */
export async function runUnifiedWebSearch(options: WebSearchOptions): Promise<UnifiedWebSearchResult> {
  const query = options.query.trim();
  if (!query) {
    return { results: [], backend: "none" };
  }

  const configured = ALLOWED.has(serverConfig.webSearchProvider)
    ? serverConfig.webSearchProvider
    : "auto";
  const tryOrder: WebSearchBackend[] =
    configured === "auto"
      ? resolveBackendOrder()
      : ([configured] as WebSearchBackend[]).filter((b) => b !== "none");

  for (const backend of tryOrder) {
    if (backend === "none") {
      continue;
    }
    if (backend === "mock") {
      const results = mockWebSearchResults(query, options.limit ?? serverConfig.aiWebSearchMaxResults);
      return { results, backend: "mock" };
    }
    if (backend === "serper") {
      const results = await searchSerper(options);
      if (results.length) {
        return { results, backend: "serper" };
      }
      continue;
    }
    if (backend === "tavily") {
      const results = await searchTavilyAsWeb(options);
      if (results.length) {
        return { results, backend: "tavily" };
      }
      continue;
    }
    if (backend === "searxng") {
      const results = await searchWeb(options);
      if (results.length) {
        return { results, backend: "searxng" };
      }
    }
  }

  if (serverConfig.aiWebSearchMock) {
    const results = mockWebSearchResults(query, options.limit ?? serverConfig.aiWebSearchMaxResults);
    return { results, backend: "mock" };
  }

  return { results: [], backend: "none" };
}
