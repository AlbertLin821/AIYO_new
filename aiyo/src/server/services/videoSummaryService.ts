import { OllamaRequestError, chatWithOllama } from "@/server/ai/ollamaClient";
import {
  buildLocationFilteringPrompt,
  buildVideoFinalSummaryPrompt,
  buildVideoSummaryPrompt,
} from "@/server/ai/promptBuilder";
import { parseLocationFilterResponse, parseVideoSummaryResponse } from "@/server/ai/responseParser";
import {
  extractPlaceCandidates,
  isGenericDestinationName,
  extractPlacesFromTranscriptAndSummary,
  mergeAndDedupeExtractions,
} from "@/server/geo/extractLocations";
import { resolvePlaceExtractionsHybrid } from "@/server/geo/geocodeService";
import {
  extractYouTubeVideoId,
  fetchYouTubeMetadata,
  fetchYouTubeTranscript,
  type TranscriptEntry,
  type YouTubeChapter,
} from "@/server/providers/youtubeProvider";
import type {
  Timestamp,
  VideoRecommendation,
  VideoSummaryDebugMeta,
  VideoSummaryResult,
  VideoSummarySegment,
} from "@/types";

const videoSummaryCache = new Map<string, { expiresAt: number; result: VideoSummaryResult }>();
const VIDEO_SUMMARY_CACHE_MS = 30 * 60 * 1000;

interface VideoSummaryInput {
  url?: string;
  videoId?: string;
  title?: string;
  destination?: string;
}

interface TranscriptChunk {
  id: string;
  timestamp: string;
  startSeconds: number;
  endSeconds: number;
  text: string;
  title?: string;
}

function formatSeconds(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainingSeconds = total % 60;
  if (hours > 0) {
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(
      remainingSeconds,
    ).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}

function truncateText(input: string, maxChars: number): string {
  const text = input.replace(/\s+/g, " ").trim();
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, maxChars - 1).trimEnd()}...`;
}

function splitSentences(input: string): string[] {
  return input
    .replace(/\s+/g, " ")
    .split(/(?<=[。！？.!?])\s*/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function compactSummaryText(input: string, maxChars = 40): string {
  const firstUsefulSentence = splitSentences(input).find((sentence) => sentence.length >= 6) || input;
  const text = firstUsefulSentence
    .replace(/^(這支影片|這段影片|影片中|本影片|This video)\s*/i, "")
    .replace(/\s+/g, "")
    .trim();
  if (!text) {
    return "";
  }
  return text.length <= maxChars ? text : `${text.slice(0, Math.max(0, maxChars - 1))}…`;
}

function summarizeSegmentText(input: string, maxChars = 72): string {
  const text = splitSentences(input).slice(0, 2).join("");
  const compact = (text || input).replace(/\s+/g, "").trim();
  if (!compact) {
    return "";
  }
  return compact.length <= maxChars ? compact : `${compact.slice(0, Math.max(0, maxChars - 1))}…`;
}

function normalizeLocationKey(input: string): string {
  return input.replace(/\s+/g, "").trim().toLowerCase();
}

function locationHintMatchesVerifiedPlace(hint: string, verifiedNames: string[]): boolean {
  const normalizedHint = normalizeLocationKey(hint);
  return verifiedNames.some(
    (name) => normalizedHint === name || normalizedHint.includes(name) || name.includes(normalizedHint),
  );
}

function looksGenericSummary(summary: string): boolean {
  const normalized = summary.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  const genericSignals = [
    "destination planning context",
    "trip overview",
    "travel context",
    "useful for planning",
    "planning context",
    "video provides",
  ];
  return genericSignals.some((signal) => normalized.includes(signal));
}

function chunkTranscriptEntries(entries: TranscriptEntry[]): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = [];
  const maxChars = 780;
  const maxDurationSeconds = 150;
  const maxEntries = 8;

  let current: TranscriptEntry[] = [];
  let currentChars = 0;

  const flush = () => {
    if (!current.length) {
      return;
    }
    const first = current[0];
    const last = current[current.length - 1];
    chunks.push({
      id: `chunk_${chunks.length + 1}`,
      timestamp: formatSeconds(first.startSeconds),
      startSeconds: first.startSeconds,
      endSeconds: Math.ceil(last.startSeconds + last.durationSeconds),
      text: current.map((entry) => entry.text).join(" ").replace(/\s+/g, " ").trim(),
    });
    current = [];
    currentChars = 0;
  };

  for (const entry of entries) {
    const projectedChars = currentChars + entry.text.length;
    const duration =
      current.length > 0
        ? entry.startSeconds + entry.durationSeconds - current[0].startSeconds
        : entry.durationSeconds;

    if (
      current.length > 0 &&
      (projectedChars > maxChars || duration > maxDurationSeconds || current.length >= maxEntries)
    ) {
      flush();
    }

    current.push(entry);
    currentChars += entry.text.length;
  }

  flush();
  return chunks.slice(0, 8);
}

function chunkTranscriptByNativeChapters(
  entries: TranscriptEntry[],
  chapters: YouTubeChapter[],
): TranscriptChunk[] {
  return chapters
    .map((chapter, index) => {
      const endSeconds =
        chapter.endSeconds && chapter.endSeconds > chapter.startSeconds
          ? chapter.endSeconds
          : chapters[index + 1]?.startSeconds ?? chapter.startSeconds + 180;
      const chapterEntries = entries.filter(
        (entry) => entry.startSeconds >= chapter.startSeconds && entry.startSeconds < endSeconds,
      );
      const text = chapterEntries
        .map((entry) => entry.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      return {
        id: `chapter_${index + 1}`,
        timestamp: chapter.timestamp,
        startSeconds: chapter.startSeconds,
        endSeconds,
        text,
        title: chapter.title,
      };
    })
    .filter((chunk) => chunk.text.length > 0)
    .slice(0, 8);
}

function buildHeuristicSegments(chunks: TranscriptChunk[], destination?: string): VideoSummarySegment[] {
  const segments = chunks.flatMap((chunk, chunkIndex) => {
    const locationHints = mergeAndDedupeExtractions(
      extractPlaceCandidates(chunk.text),
      destination,
    )
      .map((entry) => entry.displayName)
      .slice(0, 4);
    const sentences = splitSentences(chunk.text);
    const text = summarizeSegmentText(sentences.slice(0, 2).join("") || chunk.text);
    const hints = locationHints.length ? locationHints : [chunk.title || ""].filter(Boolean);

    return hints.slice(0, 3).map((hint, hintIndex) => {
      const titleSource = hint || sentences[0] || chunk.text;
      const title = truncateText(titleSource, 32);
      return {
        id: `segment_${chunkIndex + 1}_${hintIndex + 1}`,
        timestamp: chunk.timestamp,
        startLabel: chunk.timestamp,
        endLabel: formatSeconds(chunk.endSeconds),
        startSeconds: chunk.startSeconds,
        endSeconds: chunk.endSeconds,
        title,
        text,
        summary: text,
        highlights: sentences.slice(1, 4).map((sentence) => summarizeSegmentText(sentence, 42)),
        locationHints: hint && !isGenericDestinationName(hint, destination) ? [hint] : [],
      };
    });
  });

  return segments.slice(0, 10);
}

function buildHeuristicSummary(chunks: TranscriptChunk[], destination?: string): string {
  const placeHints = mergeAndDedupeExtractions(
    chunks.flatMap((chunk) => extractPlaceCandidates(chunk.text)),
    destination,
  )
    .map((entry) => entry.displayName)
    .slice(0, 3);

  if (placeHints.length > 0) {
    return compactSummaryText(
      `${destination ? `${destination}旅遊聚焦` : "旅遊影片聚焦"}${placeHints.join("、")}等景點美食。`,
    );
  }

  return compactSummaryText(`${destination || "旅遊"}重點快速整理，適合規劃行程參考。`);
}

function alignSegmentsWithChunks(
  parsedSegments: VideoSummarySegment[],
  chunks: TranscriptChunk[],
  destination?: string,
): VideoSummarySegment[] {
  if (parsedSegments.length === 0) {
    return buildHeuristicSegments(chunks, destination);
  }

  return parsedSegments.map((segment, index) => {
    const matchedChunk =
      chunks.find((chunk) => chunk.timestamp === segment.timestamp) ||
      chunks[index] ||
      chunks[chunks.length - 1];
    const locationHints = mergeAndDedupeExtractions([
      ...(segment.locationHints || []),
      ...extractPlaceCandidates(segment.text),
    ], destination)
      .map((entry) => entry.displayName)
      .slice(0, 4);

    return {
      ...segment,
      id: segment.id || `segment_${index + 1}`,
      timestamp: matchedChunk?.timestamp || segment.timestamp,
      startLabel: matchedChunk?.timestamp || segment.timestamp,
      endLabel: matchedChunk ? formatSeconds(matchedChunk.endSeconds) : segment.endLabel,
      startSeconds: matchedChunk?.startSeconds ?? segment.startSeconds,
      endSeconds: matchedChunk?.endSeconds ?? segment.endSeconds,
      title: segment.title || matchedChunk?.title || truncateText(segment.text, 32),
      text: summarizeSegmentText(segment.text || segment.summary || matchedChunk?.text || ""),
      summary: summarizeSegmentText(segment.summary || segment.text || matchedChunk?.text || ""),
      highlights: segment.highlights?.length
        ? segment.highlights.map((highlight) => summarizeSegmentText(highlight, 42)).slice(0, 3)
        : undefined,
      locationHints,
    };
  });
}

async function summarizeTranscriptWithOllama(input: {
  title: string;
  description: string;
  destination?: string;
  chunks: TranscriptChunk[];
}): Promise<
  | {
      summary: string;
      segments: VideoSummarySegment[];
      extractedLocations: string[];
      parseFailed: boolean;
    }
  | null
> {
  const fallbackSegments = buildHeuristicSegments(input.chunks, input.destination);
  const fallback = {
    title: input.title,
    summary: buildHeuristicSummary(input.chunks, input.destination),
    segments: fallbackSegments,
    extractedLocations: mergeAndDedupeExtractions([
      ...fallbackSegments.flatMap((segment) => segment.locationHints || []),
    ], input.destination).map((entry) => entry.displayName),
  };

  for (const retryMode of [false, true]) {
    try {
      const raw = await chatWithOllama({
        format: "json",
        task: "video-summary-fast",
        messages: [
          { role: "system", content: "Return valid JSON only." },
          {
            role: "user",
            content: buildVideoSummaryPrompt({
              title: input.title,
              description: input.description,
              destination: input.destination,
              transcriptSegments: input.chunks,
              retryMode,
            }),
          },
        ],
      });

      const parsed = parseVideoSummaryResponse(raw, fallback);
      const alignedSegments = alignSegmentsWithChunks(parsed.segments, input.chunks, input.destination);
      const mergedLocations = mergeAndDedupeExtractions([
        ...(parsed.extractedLocations || []),
        ...alignedSegments.flatMap((segment) => segment.locationHints || []),
      ], input.destination).map((entry) => entry.displayName);

      if (!parsed.parseFailed && !looksGenericSummary(parsed.summary)) {
        const fastResult = {
          summary: compactSummaryText(parsed.summary),
          segments: alignedSegments,
          extractedLocations: mergedLocations,
          parseFailed: false,
        };

        try {
          const finalRaw = await chatWithOllama({
            format: "json",
            task: "video-summary-final",
            messages: [
              { role: "system", content: "Return valid JSON only." },
              {
                role: "user",
                content: buildVideoFinalSummaryPrompt({
                  title: input.title,
                  destination: input.destination,
                  draft: {
                    summary: fastResult.summary,
                    segments: fastResult.segments.map((segment) => ({
                      timestamp: segment.timestamp,
                      title: segment.title,
                      text: segment.text,
                      highlights: segment.highlights,
                      locationHints: segment.locationHints,
                    })),
                    extractedLocations: fastResult.extractedLocations,
                  },
                }),
              },
            ],
          });
          const finalParsed = parseVideoSummaryResponse(finalRaw, {
            title: input.title,
            summary: fastResult.summary,
            segments: fastResult.segments,
            extractedLocations: fastResult.extractedLocations,
          });
          const finalAlignedSegments = alignSegmentsWithChunks(finalParsed.segments, input.chunks, input.destination);
          const finalMergedLocations = mergeAndDedupeExtractions([
            ...fastResult.extractedLocations,
            ...(finalParsed.extractedLocations || []),
            ...finalAlignedSegments.flatMap((segment) => segment.locationHints || []),
          ], input.destination).map((entry) => entry.displayName);

          if (!finalParsed.parseFailed && !looksGenericSummary(finalParsed.summary)) {
            return {
              summary: compactSummaryText(finalParsed.summary),
              segments: finalAlignedSegments,
              extractedLocations: finalMergedLocations,
              parseFailed: false,
            };
          }
        } catch (error) {
          if (!(error instanceof OllamaRequestError)) {
            throw error;
          }
        }

        return {
          summary: compactSummaryText(fastResult.summary),
          segments: fastResult.segments,
          extractedLocations: fastResult.extractedLocations,
          parseFailed: false,
        };
      }
    } catch (error) {
      if (!(error instanceof OllamaRequestError)) {
        throw error;
      }
      return null;
    }
  }

  return {
    summary: compactSummaryText(fallback.summary),
    segments: fallback.segments,
    extractedLocations: fallback.extractedLocations,
    parseFailed: true,
  };
}

async function filterLocationsWithOllama(input: {
  title: string;
  destination?: string;
  summary: string;
  segmentTexts: string[];
  transcriptTexts: string[];
  candidateLocations: string[];
}): Promise<string[]> {
  if (input.candidateLocations.length === 0) {
    return [];
  }

  try {
    const raw = await chatWithOllama({
      format: "json",
      task: "location-filter",
      messages: [
        { role: "system", content: "Return valid JSON only." },
        {
          role: "user",
          content: buildLocationFilteringPrompt({
            title: input.title,
            destination: input.destination,
            summary: input.summary,
            segmentTexts: input.segmentTexts,
            transcriptChunks: input.transcriptTexts,
            candidateLocations: input.candidateLocations,
          }),
        },
      ],
    });
    const parsed = parseLocationFilterResponse(raw);
    if (parsed.parseFailed || parsed.acceptedLocations.length === 0) {
      return input.candidateLocations;
    }
    return parsed.acceptedLocations;
  } catch (error) {
    if (!(error instanceof OllamaRequestError)) {
      throw error;
    }
    return input.candidateLocations;
  }
}

function toTimestamps(segments: VideoSummarySegment[]): Timestamp[] {
  return segments.map((segment) => ({
    time: segment.timestamp,
    label: segment.title || segment.text,
  }));
}

export async function summarizeVideo(input: VideoSummaryInput): Promise<VideoSummaryResult> {
  const idFromField = input.videoId?.trim();
  const idFromUrl = extractYouTubeVideoId(input.url || "") || "";
  if (!idFromField && !idFromUrl) {
    throw new Error("INVALID_VIDEO_REFERENCE");
  }

  const videoId = idFromField || idFromUrl;
  const canonicalUrl = input.url?.trim() || `https://www.youtube.com/watch?v=${videoId}`;
  const metadata = await fetchYouTubeMetadata({
    url: canonicalUrl,
    title: input.title,
  });
  const resolvedVideoId = metadata.videoId || videoId;

  const cached = videoSummaryCache.get(resolvedVideoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const transcriptResult = await fetchYouTubeTranscript(resolvedVideoId);

  if (transcriptResult.entries.length === 0) {
    const unavailableReason = "無法取得逐字稿，暫時無法產生精準摘要。";
    const video: VideoRecommendation = {
      id: metadata.id,
      videoId: metadata.videoId,
      title: metadata.title,
      thumbnail: metadata.thumbnail,
      url: metadata.url,
      duration: metadata.duration,
      summary: "",
      description: metadata.description,
      source: metadata.source,
      channelTitle: metadata.channelTitle,
      publishedAt: metadata.publishedAt,
      timestamps: [],
      summarySegments: [],
      extractedLocations: [],
    };

    const unavailableResult: VideoSummaryResult = {
      source: "youtube-summary-service",
      transcriptSource: "none",
      summarySource: "unavailable",
      segmentSource: "unavailable",
      title: metadata.title,
      summary: "",
      segments: [],
      extractedLocations: [],
      summaryUnavailable: true,
      unavailableReason,
      fallbackReason: transcriptResult.fallbackReason || unavailableReason,
      video,
      debug: {
        transcriptSource: "none",
        summarySource: "unavailable",
        segmentSource: "unavailable",
        captionLanguage: transcriptResult.captionLanguage,
        captionKind: transcriptResult.captionKind,
        captionSource: transcriptResult.captionSource,
      },
    };

    videoSummaryCache.set(resolvedVideoId, {
      expiresAt: Date.now() + VIDEO_SUMMARY_CACHE_MS,
      result: unavailableResult,
    });

    return unavailableResult;
  }

  const transcriptEntries = transcriptResult.entries;
  const transcriptSource = "youtube" as const;

  const nativeChapterChunks =
    metadata.chapters.length > 1
      ? chunkTranscriptByNativeChapters(transcriptEntries, metadata.chapters)
      : [];
  const chunks =
    nativeChapterChunks.length >= 2 ? nativeChapterChunks : chunkTranscriptEntries(transcriptEntries);
  const heuristicSegments = buildHeuristicSegments(chunks);
  const heuristicSummary = buildHeuristicSummary(chunks, input.destination);

  const ollamaSummary = chunks.length
    ? await summarizeTranscriptWithOllama({
        title: metadata.title,
        description: metadata.description,
        destination: input.destination,
        chunks,
      })
    : null;

  const summarySource: VideoSummaryDebugMeta["summarySource"] =
    ollamaSummary && !ollamaSummary.parseFailed
      ? "ollama-transcript"
      : "heuristic-transcript-fallback";
  const segmentSource: VideoSummaryDebugMeta["segmentSource"] = "transcript-chunks";

  const summary = compactSummaryText(ollamaSummary?.summary || heuristicSummary);
  const segments = ollamaSummary?.segments?.length ? ollamaSummary.segments : heuristicSegments;
  const extractedLocationsFromSummary =
    ollamaSummary?.extractedLocations?.length ? ollamaSummary.extractedLocations : [];
  const transcriptTexts = chunks.map((chunk) => chunk.text);
  const modelFilteredLocations = await filterLocationsWithOllama({
    title: metadata.title,
    destination: input.destination,
    summary,
    segmentTexts: segments.map((segment) => segment.text),
    transcriptTexts,
    candidateLocations: mergeAndDedupeExtractions([
      ...extractedLocationsFromSummary,
      ...segments.flatMap((segment) => segment.locationHints || []),
      ...transcriptTexts.flatMap((text) => extractPlaceCandidates(text)),
      ...extractPlaceCandidates(summary),
    ], input.destination).map((entry) => entry.displayName),
  });

  const transcriptBlob = [summary, ...segments.map((segment) => segment.text), ...transcriptTexts].join("\n");

  const placeExtractions = extractPlacesFromTranscriptAndSummary({
    summary,
    segmentTexts: segments.map((segment) => segment.text),
    transcriptTexts,
    llmLocationNames: mergeAndDedupeExtractions([
      ...extractedLocationsFromSummary,
      ...modelFilteredLocations,
    ], input.destination).map((entry) => entry.displayName),
    destinationHint: input.destination,
    videoTitle: metadata.title,
  }).slice(0, 16);

  const geo = await resolvePlaceExtractionsHybrid(placeExtractions, {
    destinationHint: input.destination,
    transcriptContext: transcriptBlob,
  });

  const verifiedLocations = geo.locations
    .filter((loc) => loc.verified === true && loc.resolvedFrom === "google-geocode")
    .slice(0, 16);
  const verifiedLocationKeys = verifiedLocations.map((loc) => normalizeLocationKey(loc.name));
  const extractedLocationNames = verifiedLocations.map((loc) => loc.name);
  const geocodeWarnings = geo.failures.length ? geo.failures : undefined;

  const resolvedSegmentLocations = segments
    .map((segment) => {
      const locationHints = mergeAndDedupeExtractions([
        ...(segment.locationHints || []),
        ...extractPlaceCandidates(segment.text),
      ], input.destination)
        .map((entry) => entry.displayName)
        .filter((hint) => locationHintMatchesVerifiedPlace(hint, verifiedLocationKeys))
        .slice(0, 4);

      return {
        ...segment,
        text: summarizeSegmentText(segment.text || segment.summary || ""),
        summary: summarizeSegmentText(segment.summary || segment.text || ""),
        locationHints,
      };
    })
    .filter((segment) => (segment.locationHints || []).length > 0);

  const video: VideoRecommendation = {
    id: metadata.id,
    videoId: metadata.videoId,
    title: metadata.title,
    thumbnail: metadata.thumbnail,
    url: metadata.url,
    duration: metadata.duration,
    summary,
    description: metadata.description,
    source: metadata.source,
    channelTitle: metadata.channelTitle,
    publishedAt: metadata.publishedAt,
    timestamps: toTimestamps(resolvedSegmentLocations),
    summarySegments: resolvedSegmentLocations,
    extractedLocations: verifiedLocations,
  };

  const fallbackMessages = [
    ollamaSummary?.parseFailed
      ? "模型摘要過於泛泛或 JSON 異常，已改用逐字稿規則式摘要。"
      : undefined,
    !ollamaSummary ? "Ollama 無法使用，已改用逐字稿規則式摘要。" : undefined,
  ].filter(Boolean) as string[];

  const result: VideoSummaryResult = {
    source: "youtube-summary-service",
    transcriptSource,
    summarySource,
    segmentSource,
    title: metadata.title,
    summary,
    segments: resolvedSegmentLocations,
    extractedLocations: extractedLocationNames,
    mapsProvenance: geo.mapsProvenance,
    geocodeWarnings,
    fallbackReason: fallbackMessages.length ? fallbackMessages.join(" ") : undefined,
    video,
    debug: {
      transcriptSource,
      summarySource,
      segmentSource,
      captionLanguage: transcriptResult.captionLanguage,
      captionKind: transcriptResult.captionKind,
      captionSource: transcriptResult.captionSource,
    },
  };

  videoSummaryCache.set(resolvedVideoId, {
    expiresAt: Date.now() + VIDEO_SUMMARY_CACHE_MS,
    result,
  });

  return result;
}
