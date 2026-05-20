import { serverConfig } from "@/server/config";
import type { Mem0MemoryRecord } from "@/server/memory/mem0Client";
import { listMemories, searchMemories } from "@/server/memory/mem0Client";

export type MemoryRetrievalMode = "mem0-search" | "keyword-local" | "empty";

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
}): Promise<{ memories: Mem0MemoryRecord[]; mode: MemoryRetrievalMode }> {
  const query = input.query.trim();
  const topK = Math.min(20, Math.max(1, input.topK ?? serverConfig.mem0TopK));

  if (!query) {
    return { memories: [], mode: "empty" };
  }

  if (serverConfig.mem0Enabled) {
    const vectorHits = await searchMemories({ userId: input.userId, query, topK });
    if (vectorHits.length) {
      const memories: Mem0MemoryRecord[] = vectorHits.map((h) => ({
        id: h.id,
        memory: h.memory,
        score: h.score,
        user_id: h.user_id,
        created_at: h.created_at,
        updated_at: h.updated_at,
      }));
      return { memories, mode: "mem0-search" };
    }
  }

  const all = await listMemories(input.userId);
  const ranked = rankMemoriesByKeywords(all, query, topK);
  const memories = ranked.length ? ranked : all.slice(0, topK);
  return {
    memories,
    mode: memories.length ? "keyword-local" : "empty",
  };
}
