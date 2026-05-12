import { chatWithOllama } from "@/server/ai/ollamaClient";
import { buildVideoMomentPolishingPrompt } from "@/server/ai/promptBuilder";
import { parseVideoMomentPolishingResponse } from "@/server/ai/responseParser";
import { serverConfig } from "@/server/config";
import { dedupeRepeatedPlaceNamesInText } from "@/server/video/segmentPlaceDedupe";
import type { VideoSummarySegment } from "@/types";

type PolishedMoment = {
  id: string;
  timestamp: string;
  startSeconds: number;
  endSeconds: number;
  title: string;
  text: string;
  summary: string;
  locationHints: string[];
  foods?: string[];
};

export function mergeVideoMomentPolishIntoSegments(
  segments: VideoSummarySegment[],
  moments: PolishedMoment[],
): { next: VideoSummarySegment[]; matched: number } {
  const byId = new Map(moments.map((m) => [m.id, m]));
  let matched = 0;
  const next = segments.map((seg) => {
    const m = byId.get(seg.id);
    if (!m) {
      return seg;
    }
    matched += 1;
    const startSeconds = seg.startSeconds ?? 0;
    const endSeconds = seg.endSeconds ?? 0;
    const hints =
      m.locationHints && m.locationHints.length > 0 ? m.locationHints : seg.locationHints;
    const title = m.title?.trim() ? m.title.trim() : seg.title;
    let summary = m.summary?.trim() ? m.summary.trim() : seg.summary;
    let text = m.text?.trim() ? m.text.trim() : summary || seg.text;
    const hintList = hints ?? [];
    summary =
      summary !== undefined ? dedupeRepeatedPlaceNamesInText(summary, hintList) : undefined;
    text = dedupeRepeatedPlaceNamesInText(text ?? summary ?? "", hintList);
    return {
      ...seg,
      timestamp: seg.timestamp,
      startSeconds,
      endSeconds,
      endLabel: seg.endLabel,
      title,
      text,
      summary,
      locationHints: hints,
      foods: m.foods && m.foods.length > 0 ? m.foods : seg.foods,
      highlights: seg.highlights,
      extractionSource: "ai-polished" as const,
    };
  });
  return { next, matched };
}

/**
 * 以 Ollama JSON 模式拋光段落（沿用 `buildVideoMomentPolishingPrompt` schema）；時間錨點以原片段為準。
 */
export async function polishVideoSummarySegmentsWithOllama(
  segments: VideoSummarySegment[],
  ctx: { videoTitle: string; destination?: string },
): Promise<VideoSummarySegment[]> {
  if (!segments.length || !serverConfig.ollamaVideoSegmentJsonPolish) {
    return segments;
  }

  const userContent = buildVideoMomentPolishingPrompt({
    title: ctx.videoTitle,
    destination: ctx.destination,
    language: "traditional-chinese",
    moments: segments.map((s) => ({
      id: s.id,
      timestamp: s.timestamp,
      startSeconds: s.startSeconds ?? 0,
      endSeconds: s.endSeconds ?? 0,
      title: s.title || "",
      text: s.text || "",
      summary: s.summary || "",
      locationHints: s.locationHints ?? [],
      foods: s.foods,
      confidence: s.confidence,
    })),
  });

  const timeoutMs = Math.min(90_000, Math.max(25_000, serverConfig.ollamaTimeoutMs));

  try {
    const raw = await chatWithOllama({
      format: "json",
      task: "video-moment-polish",
      timeoutMs,
      messages: [
        {
          role: "system",
          content:
            "You polish travel vlog moment JSON. Output a single JSON object with key moments only; follow the user schema exactly.",
        },
        { role: "user", content: userContent },
      ],
    });
    const { moments, parseFailed } = parseVideoMomentPolishingResponse(raw);
    if (parseFailed || !moments.length) {
      return segments;
    }
    const { next, matched } = mergeVideoMomentPolishIntoSegments(segments, moments);
    if (matched === 0) {
      return segments;
    }
    return next;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-segment-json-polish] fallback to deterministic segments", error);
    }
    return segments;
  }
}
