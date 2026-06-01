import { chatSourcesRecordToReferences } from "@/lib/sources/chatSourceAdapter";
import type { SourceReference } from "@/lib/types/sources";
import { normalizeWebSearchSources } from "@/server/chat/sourceNormalization";
import type { WebSearchResult } from "@/server/search/searxngClient";

/**
 * Maps unified web search hits to grounded {@link SourceReference} list (same shape as chat citations).
 */
export function webSearchResultsToSourceReferences(results: WebSearchResult[]): SourceReference[] {
  if (!results.length) {
    return [];
  }
  const sources = normalizeWebSearchSources(results);
  const citations = Object.keys(sources).sort();
  return chatSourcesRecordToReferences(citations, sources);
}
