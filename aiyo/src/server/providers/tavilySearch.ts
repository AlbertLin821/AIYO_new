import { serverConfig } from "@/server/config";

export type TavilySearchResult = {
  title: string;
  url: string;
  content: string;
  score?: number;
};

export async function tavilySearch(input: {
  query: string;
  maxResults?: number;
}): Promise<{ ok: true; answer?: string; results: TavilySearchResult[] } | { ok: false; reason: string }> {
  const key = serverConfig.tavilyApiKey?.trim();
  if (!key) {
    return { ok: false, reason: "TAVILY_API_KEY is not configured." };
  }

  const body = {
    api_key: key,
    query: input.query.trim(),
    search_depth: "basic",
    include_answer: true,
    max_results: Math.min(10, Math.max(1, input.maxResults ?? 5)),
  };

  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return { ok: false, reason: `Tavily HTTP ${response.status}: ${text.slice(0, 200)}` };
    }
    const payload = (await response.json()) as {
      answer?: string;
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };
    const results = (payload.results || []).map((row) => ({
      title: String(row.title || "").trim() || "結果",
      url: String(row.url || "").trim(),
      content: String(row.content || "").trim().slice(0, 600),
      score: row.score,
    }));
    return { ok: true, answer: payload.answer?.trim(), results };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Tavily request failed.";
    return { ok: false, reason: message };
  }
}

export function formatTavilyForPrompt(
  result: Extract<Awaited<ReturnType<typeof tavilySearch>>, { ok: true }>,
): string {
  const lines: string[] = [];
  if (result.answer) {
    lines.push(`摘要：${result.answer}`);
  }
  for (const row of result.results) {
    lines.push(`- ${row.title}：${row.content}${row.url ? `（${row.url}）` : ""}`);
  }
  return lines.join("\n").slice(0, 8000);
}
