import { chatWithOllama } from "@/server/ai/ollamaClient";
import { buildVideoMomentPolishingPrompt } from "@/server/ai/promptBuilder";
import { parseVideoMomentPolishingResponse } from "@/server/ai/responseParser";
import { serverConfig } from "@/server/config";
import {
  dedupeRepeatedPlaceNamesInText,
  hasSynonymSurfaceConflict,
} from "@/server/video/segmentPlaceDedupe";
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
      summary !== undefined
        ? dedupeRepeatedPlaceNamesInText(summary, hintList, { title })
        : undefined;
    text = dedupeRepeatedPlaceNamesInText(text ?? summary ?? "", hintList, { title });
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

const SYNONYM_REPAIR_PASS_SUFFIX = [
  "",
  "SYNONYM-CONSOLIDATION PASS (mandatory):",
  "Some moments still alternate multiple spellings for the SAME stop or station (e.g. 〇〇站 vs 〇〇車站 vs JR〇〇站 vs 〇〇駅).",
  "Rewrite title, summary, and text for EVERY moment so each POI from locationHints appears as exactly ONE chosen surface string across those three fields combined—prefer locationHints[0] when unsure.",
  "Keep ids/timestamps unchanged; keep locationHints and foods arrays identical; do not add POIs.",
].join("\n");

function combinedMomentProse(seg: VideoSummarySegment): string {
  return [seg.title, seg.summary, seg.text].filter(Boolean).join("\n");
}

function momentsNeedSynonymRepair(segments: VideoSummarySegment[]): boolean {
  return segments.some((seg) =>
    hasSynonymSurfaceConflict(seg.locationHints ?? [], combinedMomentProse(seg)),
  );
}

async function runMomentPolishRound(
  segments: VideoSummarySegment[],
  ctx: { videoTitle: string; destination?: string },
  suffix: string,
  timeoutMs: number,
): Promise<VideoSummarySegment[]> {
  const userContent =
    buildVideoMomentPolishingPrompt({
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
    }) + suffix;

  const raw = await chatWithOllama({
    format: "json",
    task: "video-moment-polish",
    timeoutMs,
    messages: [
      {
        role: "system",
        content:
          "You polish travel vlog moment JSON. Output a single JSON object with key moments only; follow the user schema exactly. Obey CLOSED-VOCAB / synonym rules strictly.",
      },
      { role: "user", content: userContent },
    ],
  });
  const { moments, parseFailed } = parseVideoMomentPolishingResponse(raw);
  if (parseFailed || !moments.length) {
    return segments;
  }
  const { next, matched } = mergeVideoMomentPolishIntoSegments(segments, moments);
  return matched === 0 ? segments : next;
}

/**
 * 以 Ollama JSON 模式拋光段落（沿用 `buildVideoMomentPolishingPrompt` schema）；時間錨點以原片段為準。
 * 若偵測到仍混用站名同義字面，自動追加最多一次修復請求。
 */
export async function polishVideoSummarySegmentsWithOllama(
  segments: VideoSummarySegment[],
  ctx: { videoTitle: string; destination?: string },
): Promise<VideoSummarySegment[]> {
  if (!segments.length || !serverConfig.ollamaVideoSegmentJsonPolish) {
    return segments;
  }

  const timeoutMs = Math.min(90_000, Math.max(25_000, serverConfig.ollamaTimeoutMs));

  try {
    const first = await runMomentPolishRound(segments, ctx, "", timeoutMs);
    if (!momentsNeedSynonymRepair(first)) {
      return first;
    }
    const second = await runMomentPolishRound(first, ctx, `\n${SYNONYM_REPAIR_PASS_SUFFIX}`, timeoutMs);
    return second;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[video-segment-json-polish] fallback to deterministic segments", error);
    }
    return segments;
  }
}
