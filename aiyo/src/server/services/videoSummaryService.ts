import { OllamaRequestError, chatWithOllama } from "@/server/ai/ollamaClient";
import { buildVideoMomentPolishingPrompt } from "@/server/ai/promptBuilder";
import { parseVideoMomentPolishingResponse } from "@/server/ai/responseParser";
import { resolvePlaceMentionsWithGeocode } from "@/server/geo/geocodeService";
import {
  extractYouTubeVideoId,
  fetchYouTubeMetadata,
  fetchYouTubeTranscript,
} from "@/server/providers/youtubeProvider";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";
import { buildMomentSegments, toVideoSummarySegments } from "@/server/video/momentSegmentBuilder";
import { dedupePlaceMentions, normalizePlaceMentionName } from "@/server/video/placeMentionNormalizer";
import { extractTimestampAwarePlaceMentions } from "@/server/video/placeMentionExtractor";
import { preprocessTranscript } from "@/server/video/transcriptProcessing";
import { selectTravelExtractionProfile } from "@/server/video/travelExtractionProfiles";
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

function compactSummaryFromSegments(segments: VideoSummarySegment[]): string {
  const top = segments.slice(0, 2).map((segment) => segment.title || segment.locationHints?.[0]).filter(Boolean) as string[];
  if (!top.length) {
    return "此影片整理了旅遊行程重點與景點片段。";
  }
  const sentence = `此影片重點包含${top.join("、")}等旅遊片段。`;
  return sentence.length <= 40 ? sentence : `${sentence.slice(0, 39)}…`;
}

function parseDurationToSeconds(duration: string): number {
  const parts = duration.split(":").map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) {
    return 0;
  }
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parts[0] || 0;
}

async function polishMomentsWithAi(input: {
  title: string;
  destination?: string;
  segments: VideoSummarySegment[];
}): Promise<VideoSummarySegment[]> {
  if (!input.segments.length) {
    return input.segments;
  }

  try {
    const raw = await chatWithOllama({
      format: "json",
      task: "video-summary-final",
      messages: [
        { role: "system", content: "Return valid JSON only." },
        {
          role: "user",
          content: buildVideoMomentPolishingPrompt({
            title: input.title,
            destination: input.destination,
            language: "traditional-chinese",
            moments: input.segments.map((segment) => ({
              id: segment.id,
              timestamp: segment.timestamp,
              startSeconds: segment.startSeconds || 0,
              endSeconds: segment.endSeconds || 0,
              title: segment.title || "",
              text: segment.text || "",
              summary: segment.summary,
              locationHints: segment.locationHints || [],
              foods: segment.foods,
              confidence: segment.confidence,
            })),
          }),
        },
      ],
    });
    const parsed = parseVideoMomentPolishingResponse(raw);
    if (parsed.parseFailed || parsed.moments.length === 0) {
      return input.segments;
    }

    const byId = new Map(input.segments.map((segment) => [segment.id, segment]));
    const polished = parsed.moments
      .map((moment) => {
        const original = byId.get(moment.id);
        if (!original) {
          return null;
        }
        return {
          ...original,
          title: moment.title || original.title,
          text: moment.text || original.text,
          summary: moment.summary || original.summary || original.text,
          extractionSource: "ai-polished" as const,
        };
      })
      .filter(Boolean) as VideoSummarySegment[];

    return polished.length ? polished : input.segments;
  } catch (error) {
    if (!(error instanceof OllamaRequestError)) {
      throw error;
    }
    return input.segments;
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
  const profile = selectTravelExtractionProfile({
    destinationHint: input.destination,
    transcriptLanguage: transcriptResult.captionLanguage,
    title: metadata.title,
    description: metadata.description,
  });
  const preprocessedLines = preprocessTranscript(transcriptEntries, profile);
  const rawMentions = extractTimestampAwarePlaceMentions({
    lines: preprocessedLines,
    profile,
    destinationHint: input.destination,
  });
  const normalizedMentions = rawMentions.map((mention) => {
    const normalizedName = normalizePlaceMentionName(mention.name, profile);
    return {
      ...mention,
      name: normalizedName,
      normalizedName: normalizedName.toLowerCase().replace(/\s+/g, ""),
    };
  });
  const mentions = dedupePlaceMentions(normalizedMentions).filter(
    (mention) =>
      mention.name &&
      !isGenericTravelLocation({
        name: mention.name,
        destinationHint: input.destination,
        profile,
      }),
  );

  const geo = await resolvePlaceMentionsWithGeocode({
    mentions,
    profile,
    destinationHint: input.destination,
  });

  const mapReadyLocations = geo.locations
    .filter((loc) => loc.verified === true || (loc.confidence || 0) >= 0.7)
    .filter(
      (loc) =>
        !isGenericTravelLocation({
          name: loc.name,
          destinationHint: input.destination,
          profile,
        }),
    )
    .slice(0, 16);
  const extractedLocationNames = mapReadyLocations.map((loc) => loc.name);
  const geocodeWarnings = geo.failures.length ? geo.failures : undefined;

  const deterministicMoments = buildMomentSegments({
    mentions: mentions.filter(
      (mention) =>
        mapReadyLocations.some((location) => location.name === mention.name) || mention.confidence >= 0.75,
    ),
    videoDurationSeconds: parseDurationToSeconds(metadata.duration),
    maxSegments: 8,
  });
  const deterministicSegments = toVideoSummarySegments(deterministicMoments);
  const polishedSegments = await polishMomentsWithAi({
    title: metadata.title,
    destination: input.destination,
    segments: deterministicSegments,
  });
  const resolvedSegmentLocations = polishedSegments.filter(
    (segment) => (segment.locationHints || []).length > 0,
  );
  const summary = compactSummaryFromSegments(resolvedSegmentLocations);
  const summarySource: VideoSummaryDebugMeta["summarySource"] =
    resolvedSegmentLocations.some((segment) => segment.extractionSource === "ai-polished")
      ? "ollama-transcript"
      : "heuristic-transcript-fallback";
  const segmentSource: VideoSummaryDebugMeta["segmentSource"] = "transcript-chunks";

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
    extractedLocations: mapReadyLocations,
  };

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
    fallbackReason:
      resolvedSegmentLocations.length === 0
        ? "無法建立穩定的重點片段，已套用 deterministic fallback。"
        : undefined,
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
