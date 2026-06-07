import { TRAVEL_ARTICLE_FALLBACKS } from "@/data/travelArticleFallbacks";
import { buildQueryGuidedArticles } from "@/data/travelArticleQueryGuides";
import { DCARD_TRAVEL_FORUMS, TRAVEL_RSS_FEEDS } from "@/data/travelArticleFeeds";
import { runUnifiedWebSearch } from "@/server/search/webSearchService";
import type { WebSearchResult } from "@/server/search/webSearchTypes";
import type { TravelArticle, TravelArticlesResult } from "@/types/travelArticle";

const DCARD_BASE = "https://www.dcard.tw";
const TRAVEL_QUERY_VARIANTS = ["旅遊", "美食", "景點", "住宿", "自由行", "攻略"] as const;
const FETCH_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Referer: "https://www.dcard.tw/",
};

type DcardPostRaw = {
  id: number;
  title?: string;
  excerpt?: string;
  forumAlias?: string;
  forumName?: string;
  likeCount?: number;
  commentCount?: number;
  createdAt?: string;
};

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 1)}…`;
}

function normalizeTitleKey(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}

function isDcardPostUrl(url: string): boolean {
  return /dcard\.tw\/f\/[^/]+\/p\/\d+/i.test(url);
}

function isDcardPostArticle(article: TravelArticle): boolean {
  return article.source === "dcard" && isDcardPostUrl(article.url);
}

function articleMatchesQuery(article: TravelArticle, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  if (isDcardPostArticle(article)) {
    return true;
  }
  const haystack = `${article.title} ${article.excerpt}`.toLowerCase();
  return haystack.includes(needle);
}

function sortDcardPostsFirst(articles: TravelArticle[]): TravelArticle[] {
  return [...articles].sort((left, right) => {
    const leftRank = isDcardPostArticle(left) ? 0 : left.source === "dcard" ? 1 : 2;
    const rightRank = isDcardPostArticle(right) ? 0 : right.source === "dcard" ? 1 : 2;
    return leftRank - rightRank;
  });
}

function filterArticlesByQuery(articles: TravelArticle[], query: string): TravelArticle[] {
  if (!query.trim()) {
    return articles;
  }
  return articles.filter((article) => articleMatchesQuery(article, query));
}

function detectSourceFromUrl(url: string): { source: TravelArticle["source"]; sourceLabel: string } {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("dcard.tw")) {
      return { source: "dcard", sourceLabel: "Dcard" };
    }
    if (host.includes("backpackers.com.tw")) {
      return { source: "blog", sourceLabel: "背包客棧" };
    }
    if (host.includes("pixnet.net")) {
      return { source: "blog", sourceLabel: "部落格" };
    }
  } catch {
    // ignore invalid url
  }
  return { source: "blog", sourceLabel: "網路搜尋" };
}

function mapWebSearchResult(row: WebSearchResult, index: number): TravelArticle | null {
  const title = row.title.trim();
  const url = row.url.trim();
  const content = row.content.trim();
  if (!title || !url || isDcardPostUrl(url)) {
    return null;
  }
  const { source, sourceLabel } = detectSourceFromUrl(url);
  return {
    id: `web-${index}-${normalizeTitleKey(title).slice(0, 24)}`,
    title,
    excerpt: truncate(stripHtml(content || title), 120),
    url,
    source,
    sourceLabel,
    publishedAt: row.publishedDate || undefined,
  };
}

function mapDcardWebSearchResult(row: WebSearchResult, index: number): TravelArticle | null {
  const title = row.title.trim();
  const url = row.url.trim();
  const content = row.content.trim();
  if (!title || !url || !isDcardPostUrl(url)) {
    return null;
  }
  return {
    id: `dcard-web-${index}-${normalizeTitleKey(title).slice(0, 24)}`,
    title,
    excerpt: truncate(stripHtml(content || title), 120),
    url,
    source: "dcard",
    sourceLabel: "Dcard",
    publishedAt: row.publishedDate || undefined,
  };
}

async function collectDcardPostsFromSearchResults(
  rows: WebSearchResult[],
  limit: number,
): Promise<TravelArticle[]> {
  const articles: TravelArticle[] = [];
  for (const row of rows) {
    const article = mapDcardWebSearchResult(row, articles.length);
    if (article) {
      articles.push(article);
    }
    if (articles.length >= limit) {
      break;
    }
  }
  return articles;
}

function travelQueryVariant(refreshSeed: number): string {
  return TRAVEL_QUERY_VARIANTS[refreshSeed % TRAVEL_QUERY_VARIANTS.length];
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  if (seed <= 0 || items.length <= 1) {
    return [...items];
  }
  const result = [...items];
  let state = (seed * 2654435761) >>> 0 || 1;
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function pickArticlesForDisplay(
  pool: TravelArticle[],
  limit: number,
  refreshSeed: number,
  excludeIds?: string[],
): TravelArticle[] {
  if (!pool.length) {
    return [];
  }

  const excluded = new Set(excludeIds ?? []);
  const withoutExcluded = excluded.size
    ? pool.filter((article) => !excluded.has(article.id) && !excluded.has(article.url))
    : pool;
  const candidates = withoutExcluded.length >= limit ? withoutExcluded : pool;
  const ordered = refreshSeed > 0 ? shuffleWithSeed(candidates, refreshSeed) : candidates;
  const maxOffset = Math.max(ordered.length - limit, 0);
  const offset = refreshSeed > 0 ? (refreshSeed * limit) % (maxOffset + 1) : 0;
  return ordered.slice(offset, offset + limit);
}

/** Dcard 官方 API 常被 Cloudflare 擋；改以網路搜尋抓取 /f/.../p/ 貼文連結。 */
async function fetchDcardPostsViaWebSearch(
  query: string,
  limit: number,
  refreshSeed = 0,
): Promise<TravelArticle[]> {
  const keyword = query.trim();
  const variant = travelQueryVariant(refreshSeed);
  const searchQuery = keyword ? `site:dcard.tw ${keyword} ${variant}` : "site:dcard.tw/f/travel";
  const fetchLimit = Math.max(limit * 2, 12);
  const searchPage = Math.floor(refreshSeed / TRAVEL_QUERY_VARIANTS.length) + 1;
  const collected: TravelArticle[] = [];

  const unified = await runUnifiedWebSearch({
    query: searchQuery,
    limit: fetchLimit,
    page: searchPage,
  });
  collected.push(...(await collectDcardPostsFromSearchResults(unified.results, fetchLimit)));

  return dedupeArticles(collected).slice(0, limit);
}

async function fetchWebSearchTravelArticles(
  query: string,
  limit: number,
  refreshSeed = 0,
): Promise<TravelArticle[]> {
  const variant = travelQueryVariant(refreshSeed);
  const searchQuery = `${query.trim()} ${variant} 推薦`;
  const searchPage = Math.floor(refreshSeed / TRAVEL_QUERY_VARIANTS.length) + 1;
  const { results } = await runUnifiedWebSearch({
    query: searchQuery,
    limit: Math.max(limit, 8),
    page: searchPage,
  });
  return results
    .map((row, index) => mapWebSearchResult(row, index))
    .filter((item): item is TravelArticle => Boolean(item))
    .slice(0, limit);
}

function dedupeArticles(articles: TravelArticle[]): TravelArticle[] {
  const seen = new Set<string>();
  const result: TravelArticle[] = [];
  for (const article of articles) {
    const key = normalizeTitleKey(article.title);
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(article);
  }
  return result;
}

async function fetchJson<T>(url: string, timeoutMs = 8000): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      next: { revalidate: 300 },
    });
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        ...FETCH_HEADERS,
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
      next: { revalidate: 600 },
    });
    if (!response.ok) {
      return null;
    }
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function mapDcardPost(post: DcardPostRaw, label: string): TravelArticle | null {
  if (!post.id || !post.title?.trim()) {
    return null;
  }
  const forumAlias = post.forumAlias || "travel";
  return {
    id: `dcard-${post.id}`,
    title: post.title.trim(),
    excerpt: truncate(stripHtml(post.excerpt || post.title), 120),
    url: `${DCARD_BASE}/f/${forumAlias}/p/${post.id}`,
    source: "dcard",
    sourceLabel: post.forumName ? `Dcard ${post.forumName}` : label,
    publishedAt: post.createdAt,
    likeCount: post.likeCount,
    commentCount: post.commentCount,
  };
}

async function fetchDcardForumPosts(
  forumAlias: string,
  label: string,
  limit: number,
): Promise<TravelArticle[]> {
  const data = await fetchJson<DcardPostRaw[]>(
    `${DCARD_BASE}/service/api/v2/forums/${forumAlias}/posts?popular=true&limit=${limit}`,
  );
  if (!Array.isArray(data)) {
    return [];
  }
  return data
    .map((post) => mapDcardPost(post, label))
    .filter((item): item is TravelArticle => Boolean(item));
}

async function fetchDcardSearchPosts(query: string, limit: number): Promise<TravelArticle[]> {
  const encoded = encodeURIComponent(query);
  const data = await fetchJson<DcardPostRaw[]>(
    `${DCARD_BASE}/service/api/v2/search/posts?query=${encoded}&limit=${limit}&forum=travel`,
  );
  if (!Array.isArray(data)) {
    const fallbackSearch = await fetchJson<DcardPostRaw[]>(
      `${DCARD_BASE}/service/api/v2/search/posts?query=${encoded}&limit=${limit}`,
    );
    if (!Array.isArray(fallbackSearch)) {
      return [];
    }
    return fallbackSearch
      .map((post) => mapDcardPost(post, "Dcard"))
      .filter((item): item is TravelArticle => Boolean(item));
  }
  return data
    .map((post) => mapDcardPost(post, "Dcard"))
    .filter((item): item is TravelArticle => Boolean(item));
}

function extractRssTag(block: string, tag: string): string | undefined {
  const cdataMatch = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>`, "i").exec(
    block,
  );
  if (cdataMatch?.[1]) {
    return cdataMatch[1].trim();
  }
  const plainMatch = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i").exec(block);
  return plainMatch?.[1]?.trim();
}

function parseRssArticles(
  xml: string,
  feedLabel: string,
  limit: number,
  offset = 0,
): TravelArticle[] {
  const items = [...xml.matchAll(/<item[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const articles: TravelArticle[] = [];

  for (const block of items.slice(offset, offset + limit)) {
    const title = extractRssTag(block, "title");
    const link = extractRssTag(block, "link");
    if (!title || !link) {
      continue;
    }
    const description =
      extractRssTag(block, "description") || extractRssTag(block, "content:encoded") || title;
    const pubDate = extractRssTag(block, "pubDate") || extractRssTag(block, "updated");
    articles.push({
      id: `rss-${feedLabel}-${articles.length}-${normalizeTitleKey(title).slice(0, 24)}`,
      title: stripHtml(title),
      excerpt: truncate(stripHtml(description), 120),
      url: link,
      source: "blog",
      sourceLabel: feedLabel,
      publishedAt: pubDate,
    });
  }

  return articles;
}

async function fetchRssFeedArticles(
  feed: (typeof TRAVEL_RSS_FEEDS)[number],
  limit: number,
  offset = 0,
): Promise<TravelArticle[]> {
  const xml = await fetchText(feed.url);
  if (!xml) {
    return [];
  }
  return parseRssArticles(xml, feed.label, limit, offset);
}

export async function getTravelArticles(params?: {
  query?: string;
  limit?: number;
  refreshSeed?: number;
  excludeIds?: string[];
}): Promise<TravelArticlesResult> {
  const limit = Math.min(Math.max(params?.limit ?? 8, 4), 16);
  const refreshSeed = Math.max(0, Math.floor(params?.refreshSeed ?? 0));
  const poolLimit = Math.min(Math.max(limit * 4, 16), 32);
  const query = params?.query?.trim() || "";
  const rssOffset = refreshSeed * 2;
  const perSourceLimit = query ? Math.ceil(poolLimit / 2) : Math.ceil(poolLimit / 3);
  const sources: string[] = [];
  const batches = await Promise.allSettled([
    query
      ? fetchDcardSearchPosts(query, perSourceLimit)
      : Promise.all(
          DCARD_TRAVEL_FORUMS.map((forum) =>
            fetchDcardForumPosts(forum.alias, forum.label, perSourceLimit),
          ),
        ).then((groups) => groups.flat()),
    ...TRAVEL_RSS_FEEDS.map((feed) => fetchRssFeedArticles(feed, perSourceLimit, rssOffset)),
    fetchDcardPostsViaWebSearch(query, perSourceLimit, refreshSeed),
    query ? fetchWebSearchTravelArticles(query, perSourceLimit, refreshSeed) : Promise.resolve([]),
  ]);

  const merged: TravelArticle[] = [];
  for (const batch of batches) {
    if (batch.status !== "fulfilled" || !batch.value.length) {
      continue;
    }
    const articles = Array.isArray(batch.value) ? batch.value : [batch.value];
    merged.push(...articles);
    for (const article of articles) {
      if (!sources.includes(article.sourceLabel)) {
        sources.push(article.sourceLabel);
      }
    }
  }

  const pool = dedupeArticles(
    sortDcardPostsFirst(query ? filterArticlesByQuery(merged, query) : merged),
  );
  const picked = pickArticlesForDisplay(pool, limit, refreshSeed, params?.excludeIds);

  if (picked.length >= 4) {
    return { articles: picked, sources, fallbackUsed: false };
  }

  const hasDcardPosts = pool.some(isDcardPostArticle);
  const supplement = query
    ? [...pool, ...(hasDcardPosts ? [] : buildQueryGuidedArticles(query))]
    : [...pool, ...TRAVEL_ARTICLE_FALLBACKS];

  const fallbackPool = dedupeArticles(sortDcardPostsFirst(supplement));
  const fallback = pickArticlesForDisplay(fallbackPool, limit, refreshSeed, params?.excludeIds);
  const fallbackSources = [...sources];
  if (query && fallback.some((article) => article.id.startsWith("guide-"))) {
    if (!fallbackSources.includes("關鍵字導覽")) {
      fallbackSources.push("關鍵字導覽");
    }
  }

  return {
    articles: fallback,
    sources: fallbackSources.length ? fallbackSources : query ? ["關鍵字導覽"] : ["精選旅遊文章"],
    fallbackUsed: true,
  };
}
