import { serverConfig } from "@/server/config";
import { tavilySearch } from "@/server/providers/tavilySearch";
import { searchSerper } from "@/server/search/serperClient";
import type { WebSearchOptions, WebSearchResult } from "@/server/search/searxngClient";

export type WebSearchBackend = "serper" | "tavily" | "none";

export type UnifiedWebSearchResult = {
  results: WebSearchResult[];
  backend: WebSearchBackend;
};

export const AI_WEB_SEARCH_ALLOWED_PROVIDERS = ["serper", "tavily"] as const;
type AllowedProvider = (typeof AI_WEB_SEARCH_ALLOWED_PROVIDERS)[number];

function isAllowedProvider(value: string): value is AllowedProvider {
  return (AI_WEB_SEARCH_ALLOWED_PROVIDERS as readonly string[]).includes(value);
}

function warnProviderFallback(raw: string) {
  if (process.env.NODE_ENV !== "production") {
    console.warn(
      `[web-search] Unsupported WEB_SEARCH_PROVIDER="${raw}". AI search only allows serper or tavily; falling back to auto.`,
    );
  }
}

function resolveBackendOrder(): WebSearchBackend[] {
  const order: WebSearchBackend[] = [];
  if (serverConfig.serperApiKey.trim()) {
    order.push("serper");
  }
  if (serverConfig.tavilyApiKey.trim()) {
    order.push("tavily");
  }
  return order.length > 0 ? order : ["none"];
}

function resolveConfiguredProvider(): "auto" | AllowedProvider {
  const configured = serverConfig.webSearchProvider;
  if (configured === "auto" || configured === "") {
    return "auto";
  }
  if (isAllowedProvider(configured)) {
    return configured as AllowedProvider;
  }
  warnProviderFallback(configured);
  return "auto";
}

export function sanitizeAiSearchProviders(providers?: string[]): AllowedProvider[] {
  const clean = (providers || [])
    .map((provider) => provider.trim().toLowerCase())
    .filter(isAllowedProvider);
  const unique = Array.from(new Set(clean));
  return unique.length ? unique : [...AI_WEB_SEARCH_ALLOWED_PROVIDERS];
}

async function searchTavilyAsWeb(options: WebSearchOptions): Promise<WebSearchResult[]> {
  const res = await tavilySearch({
    query: options.query,
    maxResults: options.limit ?? serverConfig.aiWebSearchMaxResults,
  });
  if (!res.ok) {
    return [];
  }
  const limit = Math.min(10, Math.max(1, options.limit ?? serverConfig.aiWebSearchMaxResults));
  return res.results
    .slice(0, limit)
    .map((row) => ({
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
export async function runUnifiedWebSearch(
  options: WebSearchOptions & { providers?: string[] },
): Promise<UnifiedWebSearchResult> {
  const query = options.query.trim();
  if (!query) {
    return { results: [], backend: "none" };
  }

  const configured = resolveConfiguredProvider();
  const allowedProviders = sanitizeAiSearchProviders(options.providers);
  const tryOrder: WebSearchBackend[] =
    configured === "auto"
      ? allowedProviders.filter((provider) => resolveBackendOrder().includes(provider))
      : allowedProviders.includes(configured)
        ? ([configured] as WebSearchBackend[]).filter((b) => b !== "none")
        : [];

  for (const backend of tryOrder) {
    if (backend === "none") {
      continue;
    }
    if (backend === "serper") {
      if (!serverConfig.serperApiKey.trim()) {
        if (configured === "serper") {
          throw new Error("SERPER_API_KEY is required when WEB_SEARCH_PROVIDER=serper.");
        }
        continue;
      }
      const results = await searchSerper(options);
      if (results.length) {
        return { results, backend: "serper" };
      }
      continue;
    }
    if (backend === "tavily") {
      if (!serverConfig.tavilyApiKey.trim()) {
        if (configured === "tavily") {
          throw new Error("TAVILY_API_KEY is required when WEB_SEARCH_PROVIDER=tavily.");
        }
        continue;
      }
      const results = await searchTavilyAsWeb(options);
      if (results.length) {
        return { results, backend: "tavily" };
      }
      continue;
    }
  }

  return { results: [], backend: "none" };
}
