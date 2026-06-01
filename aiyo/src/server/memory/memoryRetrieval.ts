import { serverConfig } from "@/server/config";
import type { Mem0MemoryRecord } from "@/server/memory/mem0Client";
import { listMemories, searchMemories } from "@/server/memory/mem0Client";

export type MemoryRetrievalMode = "mem0-search" | "keyword-local" | "mem0-search-merged" | "empty";

function mergeMemoryRecords(primary: Mem0MemoryRecord[], secondary: Mem0MemoryRecord[], topK: number): Mem0MemoryRecord[] {
  const seen = new Set<string>();
  const merged: Mem0MemoryRecord[] = [];
  for (const record of [...primary, ...secondary]) {
    const key = record.id || record.memory || "";
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(record);
    if (merged.length >= topK) {
      break;
    }
  }
  return merged;
}

function tokenizeQuery(query: string): Set<string> {
  const tokens = new Set<string>();
  const parts = query
    .toLowerCase()
    .split(/[\s\u3000：，。、,/]+/u)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2);
  for (const p of parts.slice(0, 16)) {
    tokens.add(p);
  }
  return tokens;
}

function scoreMemoryText(text: string, tokens: Set<string>): number {
  if (!tokens.size) {
    return 0;
  }
  const lower = text.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (lower.includes(t)) {
      score += 1;
    }
  }
  return text.length ? score / Math.log10(10 + text.length) : 0;
}

function rankMemoriesByKeywords(memories: Mem0MemoryRecord[], query: string, topK: number): Mem0MemoryRecord[] {
  const tokens = tokenizeQuery(query);
  if (!tokens.size) {
    return memories.slice(0, topK);
  }
  return [...memories]
    .map((m) => ({
      m,
      s: scoreMemoryText(m.memory || "", tokens),
    }))
    .sort((a, b) => b.s - a.s)
    .filter((row) => row.s > 0)
    .slice(0, topK)
    .map((row) => row.m);
}

/**
 * RAG-lite: Mem0 semantic search when enabled; otherwise keyword ranking over listed memories.
 */
export async function retrieveRelevantMemoriesForUser(input: {
  userId: string;
  query: string;
  topK?: number;
  broadRecall?: boolean;
}): Promise<{ memories: Mem0MemoryRecord[]; mode: MemoryRetrievalMode }> {
  const query = input.query.trim();
  const topK = Math.min(20, Math.max(1, input.topK ?? serverConfig.mem0TopK));

  if (!query) {
    return { memories: [], mode: "empty" };
  }

  const recallQuery = input.broadRecall
    ? `${query} 旅行 目的地 去過 visited destination preferences`
    : query;

  if (serverConfig.mem0Enabled) {
    const vectorHits = await searchMemories({ userId: input.userId, query: recallQuery, topK });
    const vectorMemories: Mem0MemoryRecord[] = vectorHits.map((h) => ({
      id: h.id,
      memory: h.memory,
      score: h.score,
      user_id: h.user_id,
      created_at: h.created_at,
      updated_at: h.updated_at,
    }));

    if (vectorMemories.length && !input.broadRecall) {
      return { memories: vectorMemories, mode: "mem0-search" };
    }

    if (vectorMemories.length && input.broadRecall) {
      const all = await listMemories(input.userId);
      const ranked = rankMemoriesByKeywords(all, recallQuery, topK);
      const merged = mergeMemoryRecords(vectorMemories, ranked.length ? ranked : all, topK);
      if (merged.length) {
        return { memories: merged, mode: "mem0-search-merged" };
      }
    }
  }

  const all = await listMemories(input.userId);
  const ranked = rankMemoriesByKeywords(all, recallQuery, topK);
  const memories = ranked.length ? ranked : all.slice(0, topK);
  return {
    memories,
    mode: memories.length ? "keyword-local" : "empty",
  };
}
