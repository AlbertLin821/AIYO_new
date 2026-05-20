import { serverConfig } from "@/server/config";
import {
  buildExpandedTravelSearchQueries,
  buildVideoRecommendationSearchQuery,
  isLowIntentShortFormVideo,
  isLoosePlaceRelatedVideo,
  isTravelRelatedVideo,
  scoreSearchResultQuality,
} from "@/server/providers/travelVideoFilter";
import type { VideoRecommendation } from "@/types";

export interface VideoSearchDebugInfo {
  rawInput: string;
  searchQueries: string[];
  executedQueries: string[];
  regionCode: string;
  relevanceLanguage: string;
  selectedStrategy: "high-intent" | "literal-fallback";
  fallbackReasons: string[];
  cacheStatus?: "memory-hit" | "miss";
  cacheKey?: string;
}

export interface TranscriptEntry {
  timestamp: string;
  startSeconds: number;
  durationSeconds: number;
  text: string;
  timestampSource?: "youtube-transcript" | "description-fallback";
  timestampConfidence?: "high" | "low";
}

export interface YouTubeChapter {
  title: string;
  timestamp: string;
  startSeconds: number;
  endSeconds?: number;
}

export interface TranscriptFetchResult {
  entries: TranscriptEntry[];
  source: "youtube" | "none";
  fallbackReason?: string;
  captionLanguage?: string;
  captionKind?: "manual" | "asr";
  captionSource?: "watch-page-captions" | "timedtext" | "youtube-transcript-package";
}

interface SearchInput {
  destination?: string;
  keyword?: string;
  limit?: number;
  offset?: number;
  excludeVideoIds?: string[];
}

interface YouTubeMetadata {
  id: string;
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  url: string;
  duration: string;
  channelTitle?: string;
  publishedAt?: string;
  source: string;
  chapters: YouTubeChapter[];
}

interface CaptionTrack {
  baseUrl?: string;
  languageCode?: string;
  kind?: string;
  vssId?: string;
  name?: {
    simpleText?: string;
    runs?: Array<{ text?: string }>;
  };
}

const CAPTION_LANGUAGE_PRIORITY = [
  "zh-TW",
  "zh-Hant",
  "zh-HK",
  "zh-CN",
  "zh-Hans",
  "ja",
  "en",
] as const;

function toQuery(params: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== "") {
      query.set(key, String(value));
    }
  });
  return query.toString();
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function formatIsoDuration(input?: string): string {
  if (!input) {
    return "00:00";
  }
  const match = input.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) {
    return "00:00";
  }
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);
  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const remainingSeconds = total % 60;
  return `${pad(minutes)}:${pad(remainingSeconds)}`;
}

function parseDisplayDurationToSeconds(input?: string): number | null {
  if (!input) {
    return null;
  }
  const parts = input.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

const YOUTUBE_SEARCH_PIPELINE_VERSION = "youtube-search-v2";
const YOUTUBE_SEARCH_CACHE_MS = 20 * 60 * 1000;
const youtubeSearchCache = new Map<string, { expiresAt: number; videos: VideoRecommendation[]; debug: VideoSearchDebugInfo }>();

const DESCRIPTION_NOISE_PATTERNS = [
  /請(記得)?訂閱.*$/i,
  /別忘了.*(訂閱|按讚|分享).*$/i,
  /(訂閱|按讚|分享|開啟小鈴鐺).*$/i,
  /(追蹤|follow).*(ig|instagram|fb|facebook).*$/i,
  /合作邀約.*$/i,
  /商業合作.*$/i,
  /業配.*$/i,
  /聯絡(信箱|方式).*$/i,
  /music( by|:).*$/i,
  /音樂(來源|授權).*$/i,
  /章節.*$/i,
];

export function cleanYouTubeDescription(description: string, maxChars = 120): string {
  const withoutUrls = description
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/www\.\S+/gi, " ");
  const meaningfulLines = withoutUrls
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !DESCRIPTION_NOISE_PATTERNS.some((pattern) => pattern.test(line)))
    .filter((line) => (line.match(/#/g) || []).length <= 2)
    .filter((line) => !/^#/.test(line))
    .filter((line) => !/^\d{1,2}:\d{2}/.test(line))
    .filter((line) => !/^[\w.+-]+@[\w.-]+\.\w+/.test(line));

  const compact = meaningfulLines
    .join(" ")
    .replace(/#[\p{Letter}\p{Number}_-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!compact) {
    return "";
  }

  if (compact.length <= maxChars) {
    return compact;
  }

  const sentenceMatch = compact.match(/^(.{20,}?[。！？.!?])/);
  const candidate = sentenceMatch?.[1] || compact.slice(0, maxChars - 1);
  return `${candidate.slice(0, maxChars - 1).trimEnd()}…`;
}

function parseChapterTimestamp(input: string): number | null {
  const parts = input.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) {
    return null;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return null;
}

function extractNativeChapters(description: string, duration?: string): YouTubeChapter[] {
  const lines = description
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const chapterPattern =
    /^((?:\d{1,2}:)?\d{1,2}:\d{2})\s*(?:[-–—|]\s*)?(.+)?$/;
  const chapters: YouTubeChapter[] = [];
  const seen = new Set<number>();

  for (const line of lines) {
    const match = line.match(chapterPattern);
    if (!match?.[1]) {
      continue;
    }
    const startSeconds = parseChapterTimestamp(match[1]);
    if (startSeconds === null || seen.has(startSeconds)) {
      continue;
    }
    seen.add(startSeconds);
    chapters.push({
      title: (match[2] || "Chapter").trim(),
      timestamp: match[1],
      startSeconds,
    });
  }

  if (chapters.length < 2) {
    return [];
  }

  chapters.sort((left, right) => left.startSeconds - right.startSeconds);
  const durationSeconds = parseDisplayDurationToSeconds(duration || "");

  return chapters.map((chapter, index) => ({
    ...chapter,
    endSeconds:
      chapters[index + 1]?.startSeconds ??
      (durationSeconds && durationSeconds > chapter.startSeconds
        ? durationSeconds
        : chapter.startSeconds + 180),
  }));
}

export function extractYouTubeVideoId(url?: string): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    if (parsed.hostname.includes("youtu.be")) {
      return parsed.pathname.split("/").filter(Boolean)[0] || null;
    }
    if (parsed.hostname.includes("youtube.com")) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }
      if (parsed.pathname.startsWith("/shorts/")) {
        return parsed.pathname.split("/")[2] || null;
      }
      if (parsed.pathname.startsWith("/embed/")) {
        return parsed.pathname.split("/")[2] || null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

async function fetchMappedVideosForQuery(
  searchQuery: string,
  maxResults: number,
  opts?: {
    regionCode?: string;
    relevanceLanguage?: string;
    videoCaption?: "closedCaption" | "any";
  },
): Promise<
  | { ok: true; videos: VideoRecommendation[] }
  | { ok: false; message: string }
> {
  if (!serverConfig.youtubeApiKey) {
    return { ok: false, message: "YOUTUBE_API_KEY is not configured." };
  }

  const searchUrl = `https://www.googleapis.com/youtube/v3/search?${toQuery({
    part: "snippet",
    type: "video",
    maxResults,
    q: searchQuery,
    key: serverConfig.youtubeApiKey,
    regionCode: opts?.regionCode ?? "TW",
    relevanceLanguage: opts?.relevanceLanguage ?? "zh-Hant",
    videoCaption: opts?.videoCaption === "closedCaption" ? "closedCaption" : undefined,
  })}`;

  const searchResult = await fetchGoogleJson<{
    items?: Array<{
      id?: { videoId?: string };
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        channelTitle?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
    }>;
  }>(searchUrl);

  if (!searchResult.ok) {
    return { ok: false, message: searchResult.message };
  }

  const videoIds = (searchResult.data.items || [])
    .map((item) => item.id?.videoId)
    .filter((value): value is string => Boolean(value));

  if (videoIds.length === 0) {
    return { ok: false, message: "YouTube search returned no videos." };
  }

  const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?${toQuery({
    part: "snippet,contentDetails",
    id: videoIds.join(","),
    key: serverConfig.youtubeApiKey,
  })}`;

  const detailsResult = await fetchGoogleJson<{
    items?: Array<{
      id: string;
      contentDetails?: { duration?: string };
      snippet?: {
        title?: string;
        description?: string;
        publishedAt?: string;
        channelTitle?: string;
        thumbnails?: Record<string, { url?: string }>;
      };
    }>;
  }>(detailsUrl);

  if (!detailsResult.ok) {
    return { ok: false, message: detailsResult.message };
  }

  const videos: VideoRecommendation[] = (detailsResult.data.items || []).map((item) => ({
    id: `youtube_${item.id}`,
    videoId: item.id,
    title: item.snippet?.title || "YouTube video",
    thumbnail:
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.default?.url ||
      "",
    url: `https://www.youtube.com/watch?v=${item.id}`,
    duration: formatIsoDuration(item.contentDetails?.duration),
    summary: cleanYouTubeDescription(item.snippet?.description || ""),
    description: item.snippet?.description || "",
    source: "youtube-data-api",
    channelTitle: item.snippet?.channelTitle,
    publishedAt: item.snippet?.publishedAt,
    timestamps: [],
    extractedLocations: [],
    extractedFoods: [],
    summarySegments: [],
    listProvenance: "youtube-data-api",
  }));

  return { ok: true, videos };
}

async function fetchGoogleJson<T>(url: string): Promise<
  | { ok: true; data: T }
  | { ok: false; status: number; message: string }
> {
  const response = await fetch(url, { cache: "no-store" });
  const data = (await response.json()) as T & {
    error?: { message?: string; code?: number; errors?: Array<{ message?: string }> };
  };

  if (!response.ok) {
    const message =
      data.error?.message ||
      `YouTube API HTTP ${response.status}`;
    return { ok: false, status: response.status, message };
  }

  if (data && typeof data === "object" && "error" in data && data.error) {
    const err = data.error as { message?: string };
    return {
      ok: false,
      status: response.status,
      message: err.message || "YouTube API returned an error object.",
    };
  }

  return { ok: true, data: data as T };
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "Accept-Language": "en-US,en;q=0.9",
      "User-Agent": "Mozilla/5.0 AIYO/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`Provider request failed with status ${response.status}`);
  }
  return response.text();
}

export async function searchYouTubeVideos(input: SearchInput): Promise<{
  videos: VideoRecommendation[];
  provider: "youtube-data-api" | "mock";
  fallbackReason?: string;
  debug: VideoSearchDebugInfo;
}> {
  if (!serverConfig.youtubeApiKey) {
    return {
      videos: [],
      provider: "mock",
      fallbackReason: "YOUTUBE_API_KEY is not configured.",
      debug: {
        rawInput: buildVideoRecommendationSearchQuery({
          keyword: input.keyword,
          destination: input.destination,
        }),
        searchQueries: [],
        executedQueries: [],
        regionCode: "TW",
        relevanceLanguage: "zh-Hant",
        selectedStrategy: "high-intent",
        fallbackReasons: ["YOUTUBE_API_KEY is not configured."],
      },
    };
  }

  const rawUserQuery = buildVideoRecommendationSearchQuery({
    keyword: input.keyword,
    destination: input.destination,
  });
  if (!rawUserQuery) {
    return {
      videos: [],
      provider: "mock",
      fallbackReason: "Search query is empty (keyword or destination required).",
      debug: {
        rawInput: "",
        searchQueries: [],
        executedQueries: [],
        regionCode: "TW",
        relevanceLanguage: "zh-Hant",
        selectedStrategy: "high-intent",
        fallbackReasons: ["Search query is empty (keyword or destination required)."],
      },
    };
  }

  const limit = Math.max(1, Math.min(input.limit || 6, 10));
  const offset = Math.max(0, input.offset || 0);
  const excludedVideoIds = new Set((input.excludeVideoIds || []).map((id) => id.trim()).filter(Boolean));
  const neededResultCount = limit + offset + excludedVideoIds.size;
  const cacheKey = [
    YOUTUBE_SEARCH_PIPELINE_VERSION,
    input.destination?.trim() || "any-destination",
    rawUserQuery.trim(),
    "zh-Hant",
    limit,
    offset,
    Array.from(excludedVideoIds).sort().join(",") || "no-excludes",
  ].join(":");
  const cached = youtubeSearchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return {
      videos: cached.videos,
      provider: "youtube-data-api",
      debug: {
        ...cached.debug,
        cacheStatus: "memory-hit",
        cacheKey,
      },
    };
  }
  const compactQueryLen = rawUserQuery.replace(/[\s\u3000]+/g, "").length;
  const searchFetchCount = Math.min(30, Math.max(neededResultCount * 4, compactQueryLen <= 6 ? 24 : 16));
  const searchOpts = {
    regionCode: "TW",
    relevanceLanguage: "zh-Hant",
    videoCaption: "closedCaption" as const,
  };
  const fallbackReasons: string[] = [];
  const executedQueries: string[] = [];

  const metaFor = (v: VideoRecommendation) => ({
    title: v.title,
    description: v.description,
    channelTitle: v.channelTitle,
  });

  const buildPool = (mapped: VideoRecommendation[]): VideoRecommendation[] => {
    const strictFiltered = mapped.filter((video) =>
      !isLowIntentShortFormVideo({
        ...metaFor(video),
        durationSeconds: parseDisplayDurationToSeconds(video.duration),
      }) &&
      isTravelRelatedVideo(metaFor(video), rawUserQuery),
    );
    if (strictFiltered.length > 0) {
      return strictFiltered;
    }
    fallbackReasons.push("Strict travel filter produced too few results; falling back to loose place filter.");
    return mapped.filter(
      (video) =>
        !isLowIntentShortFormVideo({
          ...metaFor(video),
          durationSeconds: parseDisplayDurationToSeconds(video.duration),
        }) && isLoosePlaceRelatedVideo(metaFor(video), rawUserQuery),
    );
  };

  const mergeDedupe = (items: VideoRecommendation[]): VideoRecommendation[] => {
    const seen = new Map<string, VideoRecommendation>();
    for (const v of items) {
      const key = v.videoId || v.id;
      if (!seen.has(key)) {
        seen.set(key, v);
      }
    }
    return Array.from(seen.values());
  };

  const primaryQueries = buildExpandedTravelSearchQueries(rawUserQuery);
  const collected: VideoRecommendation[] = [];

  for (const q of primaryQueries) {
    executedQueries.push(q);
    const batch = await fetchMappedVideosForQuery(q, searchFetchCount, searchOpts);
    if (batch.ok) {
      collected.push(...batch.videos);
    } else {
      fallbackReasons.push(`${q}: ${batch.message}`);
    }
    if (collected.length >= neededResultCount * 6) {
      break;
    }
  }

  let mapped = mergeDedupe(collected);
  let pool = buildPool(mapped);

  if (pool.length < limit) {
    const relaxedCollected: VideoRecommendation[] = [];
    for (const q of primaryQueries) {
      executedQueries.push(`(caption:any) ${q}`);
      const batch = await fetchMappedVideosForQuery(q, searchFetchCount, {
        ...searchOpts,
        videoCaption: "any",
      });
      if (batch.ok) {
        relaxedCollected.push(...batch.videos);
      } else {
        fallbackReasons.push(`caption:any ${q}: ${batch.message}`);
      }
    }
    if (relaxedCollected.length) {
      mapped = mergeDedupe([...mapped, ...relaxedCollected]);
      pool = buildPool(mapped);
      fallbackReasons.push("Re-ran expanded queries with relaxed caption filter.");
    }
  }

  if (pool.length < limit) {
    executedQueries.push(rawUserQuery.trim());
    const literal = await fetchMappedVideosForQuery(
      rawUserQuery.trim(),
      searchFetchCount,
      { ...searchOpts, videoCaption: "any" },
    );
    if (literal.ok && literal.videos.length > 0) {
      mapped = mergeDedupe([...mapped, ...literal.videos]);
      pool = buildPool(mapped);
      fallbackReasons.push("Added literal query fallback to backfill high-intent search results.");
    } else if (!literal.ok) {
      fallbackReasons.push(`Literal fallback failed: ${literal.message}`);
    }
  }

  if (pool.length === 0 && mapped.length > 0) {
    fallbackReasons.push("No videos passed travel and place relevance filters.");
  }

  pool = pool.filter((video) => {
    const durationSeconds = parseDisplayDurationToSeconds(video.duration);
    return !isLowIntentShortFormVideo({
      ...metaFor(video),
      durationSeconds,
    });
  });

  pool.sort((a, b) => {
    const aDurationSeconds = parseDisplayDurationToSeconds(a.duration);
    const bDurationSeconds = parseDisplayDurationToSeconds(b.duration);
    return (
      scoreSearchResultQuality(
        {
          ...metaFor(b),
          durationSeconds: bDurationSeconds,
          publishedAt: b.publishedAt,
          transcriptLikelyAvailable: (bDurationSeconds ?? 0) >= 180,
        },
        rawUserQuery,
      ) -
      scoreSearchResultQuality(
        {
          ...metaFor(a),
          durationSeconds: aDurationSeconds,
          publishedAt: a.publishedAt,
          transcriptLikelyAvailable: (aDurationSeconds ?? 0) >= 180,
        },
        rawUserQuery,
      )
    );
  });

  const videos = pool
    .filter((video) => !excludedVideoIds.has(video.videoId || video.id))
    .slice(offset, offset + limit);

  const debug: VideoSearchDebugInfo = {
    rawInput: rawUserQuery,
    searchQueries: primaryQueries,
    executedQueries,
    regionCode: searchOpts.regionCode,
    relevanceLanguage: searchOpts.relevanceLanguage,
    selectedStrategy:
      executedQueries.length > primaryQueries.length ? "literal-fallback" : "high-intent",
    fallbackReasons,
    cacheStatus: "miss",
    cacheKey,
  };

  youtubeSearchCache.set(cacheKey, {
    expiresAt: Date.now() + YOUTUBE_SEARCH_CACHE_MS,
    videos,
    debug,
  });

  return {
    videos,
    provider: "youtube-data-api",
    debug,
  };
}

export async function fetchYouTubeMetadata(input: {
  url?: string;
  title?: string;
}): Promise<YouTubeMetadata> {
  const videoId = extractYouTubeVideoId(input.url) || undefined;

  if (videoId && serverConfig.youtubeApiKey) {
    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?${toQuery({
      part: "snippet,contentDetails",
      id: videoId,
      key: serverConfig.youtubeApiKey,
    })}`;
    const fetched = await fetchGoogleJson<{
      items?: Array<{
        id: string;
        contentDetails?: { duration?: string };
        snippet?: {
          title?: string;
          description?: string;
          publishedAt?: string;
          channelTitle?: string;
          thumbnails?: Record<string, { url: string }>;
        };
      }>;
    }>(detailsUrl);

    if (fetched.ok) {
      const item = fetched.data.items?.[0];
      if (item) {
        return {
          id: `youtube_${item.id}`,
          videoId: item.id,
          title: item.snippet?.title || input.title || "YouTube video",
          description: item.snippet?.description || "",
          thumbnail:
            item.snippet?.thumbnails?.high?.url ||
            item.snippet?.thumbnails?.medium?.url ||
            item.snippet?.thumbnails?.default?.url ||
            "",
          url: input.url || `https://www.youtube.com/watch?v=${item.id}`,
          duration: formatIsoDuration(item.contentDetails?.duration),
          channelTitle: item.snippet?.channelTitle,
          publishedAt: item.snippet?.publishedAt,
          source: "youtube-data-api",
          chapters: extractNativeChapters(
            item.snippet?.description || "",
            formatIsoDuration(item.contentDetails?.duration),
          ),
        };
      }
    }
  }

  if (input.url) {
    try {
      const oembedUrl = `https://www.youtube.com/oembed?${toQuery({
        url: input.url,
        format: "json",
      })}`;
      const oembedResponse = await fetch(oembedUrl, { cache: "no-store" });
      if (!oembedResponse.ok) {
        throw new Error(`oEmbed failed with status ${oembedResponse.status}`);
      }
      const payload = (await oembedResponse.json()) as {
        title?: string;
        author_name?: string;
        thumbnail_url?: string;
      };
      return {
        id: `video_${videoId || Date.now()}`,
        videoId: videoId || `video_${Date.now()}`,
        title: payload.title || input.title || "Travel video",
        description: "Metadata from YouTube oEmbed fallback.",
        thumbnail: payload.thumbnail_url || "",
        url: input.url,
        duration: "00:00",
        channelTitle: payload.author_name,
        source: "YouTube oEmbed",
        chapters: [],
      };
    } catch {
      // Fall through to static fallback.
    }
  }

  return {
    id: `video_${videoId || Date.now()}`,
    videoId: videoId || `video_${Date.now()}`,
    title: input.title || "Travel video",
    description: "Metadata fallback generated locally.",
    thumbnail: "",
    url: input.url || "https://www.youtube.com/watch?v=mock",
    duration: "00:00",
    source: "Local fallback",
    chapters: [],
  };
}

function decodeTranscriptText(text: string): string {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function readCaptionTrackName(track: CaptionTrack): string {
  if (track.name?.simpleText) {
    return track.name.simpleText;
  }
  return (track.name?.runs || [])
    .map((run) => run.text || "")
    .join("")
    .trim();
}

function parseTranscriptXml(xml: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  const regex = /<text start="([^"]+)" dur="([^"]+)"[^>]*>([\s\S]*?)<\/text>/g;
  let match: RegExpExecArray | null = regex.exec(xml);
  while (match) {
    const startSeconds = Number(match[1] || 0);
    const durationSeconds = Number(match[2] || 0);
    const text = decodeTranscriptText(match[3] || "");
    if (text) {
      entries.push({
        timestamp: formatSeconds(startSeconds),
        startSeconds,
        durationSeconds,
        text,
      });
    }
    match = regex.exec(xml);
  }
  return entries;
}

function normalizeLanguageCode(code?: string): string {
  return (code || "").trim();
}

function getLanguagePriority(code?: string): number {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) {
    return CAPTION_LANGUAGE_PRIORITY.length + 20;
  }
  const exactIndex = CAPTION_LANGUAGE_PRIORITY.findIndex((item) => item === normalized);
  if (exactIndex >= 0) {
    return exactIndex;
  }
  const base = normalized.toLowerCase().split("-")[0];
  if (base === "zh") {
    return 1;
  }
  if (base === "ja") {
    return 5;
  }
  if (base === "en") {
    return 6;
  }
  return CAPTION_LANGUAGE_PRIORITY.length + 10;
}

function isSupportedCaptionLanguage(code?: string): boolean {
  return getLanguagePriority(code) < CAPTION_LANGUAGE_PRIORITY.length + 10;
}

function isAsrTrack(track: CaptionTrack): boolean {
  return track.kind === "asr" || /a\./i.test(track.vssId || "") || /auto/i.test(readCaptionTrackName(track));
}

function selectCaptionTrack(tracks: CaptionTrack[]): CaptionTrack | null {
  if (tracks.length === 0) {
    return null;
  }

  const supportedTracks = tracks.filter((track) => isSupportedCaptionLanguage(track.languageCode));
  if (supportedTracks.length === 0) {
    return null;
  }

  const ranked = [...supportedTracks].sort((left, right) => {
    const languageDiff = getLanguagePriority(left.languageCode) - getLanguagePriority(right.languageCode);
    if (languageDiff !== 0) {
      return languageDiff;
    }
    const asrDiff = Number(isAsrTrack(left)) - Number(isAsrTrack(right));
    if (asrDiff !== 0) {
      return asrDiff;
    }
    return normalizeLanguageCode(left.languageCode).localeCompare(normalizeLanguageCode(right.languageCode));
  });

  return ranked[0] || null;
}

function extractCaptionTracks(html: string): CaptionTrack[] {
  const playerMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
  if (playerMatch?.[1]) {
    try {
      const playerResponse = JSON.parse(playerMatch[1]) as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: CaptionTrack[];
          };
        };
      };
      return playerResponse.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch {
      return [];
    }
  }

  const captionsMatch = html.match(/"captions":(\{[\s\S]*?\}),"videoDetails"/);
  if (captionsMatch?.[1]) {
    try {
      const captions = JSON.parse(captionsMatch[1]) as {
        playerCaptionsTracklistRenderer?: {
          captionTracks?: CaptionTrack[];
        };
      };
      return captions.playerCaptionsTracklistRenderer?.captionTracks || [];
    } catch {
      return [];
    }
  }

  return [];
}

async function tryFetchTimedTextXml(
  videoId: string,
  tracks: CaptionTrack[],
): Promise<{
  xml: string | null;
  language?: string;
  kind?: "manual" | "asr";
  source?: "timedtext";
}> {
  const supportedTracks = tracks.filter((track) => isSupportedCaptionLanguage(track.languageCode));
  const candidateTracks = supportedTracks.length > 0 ? [...supportedTracks].sort((left, right) => {
    const languageDiff = getLanguagePriority(left.languageCode) - getLanguagePriority(right.languageCode);
    if (languageDiff !== 0) {
      return languageDiff;
    }
    return Number(isAsrTrack(left)) - Number(isAsrTrack(right));
  }) : CAPTION_LANGUAGE_PRIORITY.map((languageCode) => ({ languageCode }));

  const attempted = new Set<string>();

  for (const track of candidateTracks) {
    const language = normalizeLanguageCode(track.languageCode) || "en";
    const urls = [
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}`,
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}&fmt=srv3`,
      isAsrTrack(track)
        ? `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}&kind=asr`
        : "",
      isAsrTrack(track)
        ? `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}&kind=asr&fmt=srv3`
        : "",
    ].filter(Boolean);

    for (const url of urls) {
      if (attempted.has(url)) {
        continue;
      }
      attempted.add(url);
      try {
        const text = await fetchText(url);
        if (text && text.includes("<text")) {
          return {
            xml: text,
            language,
            kind: isAsrTrack(track) ? "asr" : "manual",
            source: "timedtext",
          };
        }
      } catch {
        continue;
      }
    }
  }

  for (const language of CAPTION_LANGUAGE_PRIORITY) {
    const urls = [
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}`,
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}&fmt=srv3`,
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}&kind=asr`,
      `https://www.youtube.com/api/timedtext?v=${encodeURIComponent(videoId)}&lang=${encodeURIComponent(language)}&kind=asr&fmt=srv3`,
    ];
    for (const url of urls) {
      if (attempted.has(url)) {
        continue;
      }
      attempted.add(url);
      try {
        const text = await fetchText(url);
        if (text && text.includes("<text")) {
          return {
            xml: text,
            language,
            kind: url.includes("kind=asr") ? "asr" : "manual",
            source: "timedtext",
          };
        }
      } catch {
        continue;
      }
    }
  }

  return { xml: null };
}

export async function fetchYouTubeTranscript(videoId: string): Promise<TranscriptFetchResult> {
  try {
    const html = await fetchText(`https://www.youtube.com/watch?v=${videoId}&hl=zh-TW`);
    const tracks = extractCaptionTracks(html);
    const selectedTrack = selectCaptionTrack(tracks);
    if (selectedTrack?.baseUrl) {
      const transcriptXml = await fetchText(selectedTrack.baseUrl);
      const entries = parseTranscriptXml(transcriptXml);
      if (entries.length > 0) {
        return {
          entries,
          source: "youtube",
          captionLanguage: normalizeLanguageCode(selectedTrack.languageCode) || undefined,
          captionKind: isAsrTrack(selectedTrack) ? "asr" : "manual",
          captionSource: "watch-page-captions",
        };
      }
    }

    const timed = await tryFetchTimedTextXml(videoId, tracks);
    if (timed.xml) {
      const timedEntries = parseTranscriptXml(timed.xml);
      if (timedEntries.length > 0) {
        return {
          entries: timedEntries,
          source: "youtube",
          captionLanguage: timed.language,
          captionKind: timed.kind,
          captionSource: timed.source,
        };
      }
    }

    try {
      const { YoutubeTranscript } = await import("youtube-transcript");
      const packageEntries = await YoutubeTranscript.fetchTranscript(videoId);
      let entries = packageEntries
        .map((entry) => ({
          timestamp: formatSeconds(entry.offset > 10_000 ? entry.offset / 1000 : entry.offset),
          startSeconds: entry.offset > 10_000 ? entry.offset / 1000 : entry.offset,
          durationSeconds: entry.duration > 10_000 ? entry.duration / 1000 : entry.duration,
          text: decodeTranscriptText(entry.text),
        }))
        .filter((entry) => entry.text);
      if (
        entries.length > 1 &&
        entries.every((entry) => entry.startSeconds === 0) &&
        packageEntries.some((e) => e.offset > 500)
      ) {
        entries = packageEntries.map((entry) => {
          const startSeconds = entry.offset / 1000;
          return {
            timestamp: formatSeconds(startSeconds),
            startSeconds,
            durationSeconds: entry.duration > 10_000 ? entry.duration / 1000 : Math.max(0.5, entry.duration / 1000),
            text: decodeTranscriptText(entry.text),
          };
        }).filter((entry) => entry.text);
      }
      if (entries.length > 1 && entries.every((entry) => entry.startSeconds === 0)) {
        let acc = 0;
        entries = entries.map((entry, index) => {
          const dur = Math.max(2, Math.min(12, entry.durationSeconds || 4));
          const startSeconds = index === 0 ? 0 : acc;
          acc += dur;
          return {
            ...entry,
            startSeconds,
            timestamp: formatSeconds(startSeconds),
            durationSeconds: dur,
          };
        });
      }
      if (entries.length > 0) {
        return {
          entries,
          source: "youtube",
          captionSource: "youtube-transcript-package",
          captionLanguage: packageEntries.find((entry) => entry.lang)?.lang,
          captionKind: "manual",
        };
      }
    } catch {
      // Keep the explicit no-transcript response below.
    }

    return {
      entries: [],
      source: "none",
      fallbackReason: "No usable caption track was available for this video.",
      captionLanguage: undefined,
      captionKind: undefined,
      captionSource: undefined,
    };
  } catch (error) {
    return {
      entries: [],
      source: "none",
      fallbackReason: error instanceof Error ? error.message : "Transcript request failed.",
    };
  }
}

export function buildGeneratedTranscript(input: {
  metadata: Pick<YouTubeMetadata, "title" | "description">;
  destination?: string;
}): TranscriptEntry[] {
  const descriptionSentences = input.metadata.description
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const seedSentences = descriptionSentences.length
    ? descriptionSentences
    : [
        `${input.metadata.title} introduces the overall trip route and sets expectations for the destination.`,
        `The video highlights popular stops in ${input.destination || "the city"} and explains why they fit together.`,
        `The host shares practical food, transit, and pacing advice to help viewers build a usable itinerary.`,
      ];

  return seedSentences.slice(0, 6).map((sentence, index) => ({
    timestamp: formatSeconds(index * 120),
    startSeconds: index * 120,
    durationSeconds: 90,
    text: sentence,
  }));
}
