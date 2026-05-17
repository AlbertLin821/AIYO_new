import type { WebSearchResult } from "@/server/search/searxngClient";
import type { DailyForecastLine } from "@/server/providers/openMeteoWeather";
import type { TavilySearchResult } from "@/server/providers/tavilySearch";
import type { ChatSource } from "@/types";
import type { VideoRecommendation } from "@/types";

function safeDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function providerFromResult(result: WebSearchResult, domain: string): string {
  if (result.engine?.trim()) {
    return result.engine.trim();
  }
  const firstSegment = domain.split(".")[0];
  return firstSegment || "web";
}

function reliabilityFromResult(result: WebSearchResult): ChatSource["reliability"] {
  const score = result.score ?? 0;
  if (score >= 0.85) {
    return "high";
  }
  if (score >= 0.6) {
    return "medium";
  }
  return "low";
}

function faviconUrlForDomain(domain: string): string | undefined {
  if (!domain) {
    return undefined;
  }
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function sourceIdFromPrefix(prefix: string, index: number): string {
  return `${prefix}_${String(index + 1).padStart(3, "0")}`;
}

function reliabilityFromScore(score?: number): ChatSource["reliability"] {
  if ((score ?? 0) >= 0.85) {
    return "high";
  }
  if ((score ?? 0) >= 0.6) {
    return "medium";
  }
  return "low";
}

function classifyUrlType(url: string): ChatSource["type"] {
  const domain = safeDomainFromUrl(url).toLowerCase();
  if (!domain) {
    return "other";
  }
  if (domain.includes("youtube.com") || domain.includes("youtu.be")) {
    return "youtube";
  }
  if (
    domain.endsWith(".gov") ||
    domain.includes(".gov.") ||
    domain.endsWith(".go.jp") ||
    domain.includes("official") ||
    domain.includes("city.") ||
    domain.includes("pref.")
  ) {
    return "official";
  }
  return "web";
}

export function normalizeWebSearchSources(results: WebSearchResult[]): Record<string, ChatSource> {
  const retrievedAt = new Date().toISOString();
  return Object.fromEntries(
    results.map((result, index) => {
      const sourceId = sourceIdFromPrefix("src", index);
      const domain = safeDomainFromUrl(result.url);
      const source: ChatSource = {
        source_id: sourceId,
        type: classifyUrlType(result.url),
        provider: providerFromResult(result, domain),
        title: result.title,
        url: result.url,
        domain,
        favicon: faviconUrlForDomain(domain),
        snippet: result.content,
        preview_text: result.content || result.title,
        published_at: result.publishedDate,
        retrieved_at: retrievedAt,
        reliability: reliabilityFromResult(result),
        language: "zh-TW",
      };
      return [sourceId, source];
    }),
  );
}

export function normalizeWeatherSources(input: {
  destination: string;
  startDate?: string;
  endDate?: string;
  lines: DailyForecastLine[];
}): Record<string, ChatSource> {
  const retrievedAt = new Date().toISOString();
  const query = new URLSearchParams({ destination: input.destination });
  if (input.startDate) {
    query.set("start_date", input.startDate);
  }
  if (input.endDate) {
    query.set("end_date", input.endDate);
  }
  return Object.fromEntries(
    input.lines.map((line, index) => {
      const sourceId = sourceIdFromPrefix("weather", index);
      const text = `${line.date}：${line.summary}${line.precipProbMax !== undefined ? `，降雨機率最高約 ${line.precipProbMax}%` : ""}`;
      const source: ChatSource = {
        source_id: sourceId,
        type: "weather",
        provider: "open-meteo",
        title: `${input.destination} 天氣預報 ${line.date}`,
        url: `https://open-meteo.com/en/docs?${query.toString()}`,
        domain: "open-meteo.com",
        favicon: faviconUrlForDomain("open-meteo.com"),
        snippet: text,
        preview_text: `${input.destination} ${text}`,
        retrieved_at: retrievedAt,
        reliability: "high",
        language: "zh-TW",
      };
      return [sourceId, source];
    }),
  );
}

export function normalizeTavilySources(results: TavilySearchResult[]): Record<string, ChatSource> {
  const retrievedAt = new Date().toISOString();
  return Object.fromEntries(
    results
      .filter((row) => row.url.trim())
      .map((row, index) => {
        const sourceId = sourceIdFromPrefix("tavily", index);
        const domain = safeDomainFromUrl(row.url);
        const source: ChatSource = {
          source_id: sourceId,
          type: classifyUrlType(row.url),
          provider: domain.split(".")[0] || "tavily",
          title: row.title,
          url: row.url,
          domain,
          favicon: faviconUrlForDomain(domain),
          snippet: row.content,
          preview_text: row.content || row.title,
          retrieved_at: retrievedAt,
          reliability: reliabilityFromScore(row.score),
          language: "zh-TW",
        };
        return [sourceId, source];
      }),
  );
}

export function normalizeYouTubeSources(videos: VideoRecommendation[]): Record<string, ChatSource> {
  const retrievedAt = new Date().toISOString();
  return Object.fromEntries(
    videos
      .filter((video) => video.url.trim())
      .map((video, index) => {
        const sourceId = sourceIdFromPrefix("yt", index);
        const domain = safeDomainFromUrl(video.url) || "youtube.com";
        const source: ChatSource = {
          source_id: sourceId,
          type: "youtube",
          provider: video.channelTitle || video.source || "youtube",
          title: video.title,
          url: video.url,
          domain,
          favicon: faviconUrlForDomain(domain),
          snippet: video.summary || video.description || video.title,
          preview_text: video.relevanceReason || video.summary || video.description || video.title,
          thumbnail: video.thumbnail || undefined,
          published_at: video.publishedAt || null,
          retrieved_at: retrievedAt,
          reliability: video.listProvenance === "youtube-data-api" ? "high" : "medium",
          language: "zh-TW",
        };
        return [sourceId, source];
      }),
  );
}

export function mergeChatSources(...groups: Array<Record<string, ChatSource>>): Record<string, ChatSource> {
  return Object.assign({}, ...groups);
}

function scoreSourceMatch(text: string, source: ChatSource): number {
  const haystack = `${source.title} ${source.snippet} ${source.preview_text}`.toLowerCase();
  const tokens = text
    .toLowerCase()
    .split(/[\s,，。、「」:：()（）/-]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);

  let score = 0;
  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length >= 4 ? 3 : 1;
    }
  }

  if (text && haystack.includes(text.toLowerCase())) {
    score += 5;
  }
  return score;
}

const MINIMUM_CITATION_MATCH_SCORE = 3;

type CitationPreference = {
  preferredTypes?: ChatSource["type"][];
  preferredProviders?: string[];
};

export function pickCitationIdsForText(
  text: string,
  sources: Record<string, ChatSource>,
  limit = 2,
  preference?: CitationPreference,
): string[] {
  const ranked = Object.values(sources)
    .map((source) => ({
      id: source.source_id,
      score: scoreSourceMatch(text, source) +
        ((preference?.preferredTypes || []).includes(source.type) ? 4 : 0) +
        ((preference?.preferredProviders || []).some((provider) => source.provider.toLowerCase() === provider.toLowerCase()) ? 3 : 0),
    }))
    .filter((item) => item.score >= MINIMUM_CITATION_MATCH_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((item) => item.id);

  return ranked;
}
