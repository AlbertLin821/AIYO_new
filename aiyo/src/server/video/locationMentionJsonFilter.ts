import { chatWithOllama } from "@/server/ai/ollamaClient";
import { buildLocationFilteringPrompt } from "@/server/ai/promptBuilder";
import { parseLocationFilterResponse } from "@/server/ai/responseParser";
import { serverConfig } from "@/server/config";
import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";
import type { PlaceMention } from "@/server/video/placeMentionExtractor";

function compactKey(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

function mentionMatchesAccepted(name: string, accepted: string[]): boolean {
  const nk = compactKey(name);
  for (const a of accepted) {
    const ak = compactKey(a);
    if (!ak) {
      continue;
    }
    if (nk === ak || nk.includes(ak) || ak.includes(nk)) {
      return true;
    }
  }
  return false;
}

function buildTranscriptChunkStrings(lines: NormalizedTranscriptLine[], maxChars: number): string[] {
  const chunks: string[] = [];
  let budget = 0;
  for (const line of lines) {
    if (budget >= maxChars) {
      break;
    }
    const t = line.text.trim();
    if (!t) {
      continue;
    }
    chunks.push(t);
    budget += t.length;
  }
  return chunks;
}

/**
 * 以 `OLLAMA_LOCATION_MODEL` + `buildLocationFilteringPrompt` 在 geocode 前再篩地名；解析失敗或結果過窄時完整保留原列表。
 */
export async function filterPlaceMentionsWithLocationJson(
  mentions: PlaceMention[],
  ctx: {
    videoTitle: string;
    destination?: string;
    preprocessedLines: NormalizedTranscriptLine[];
  },
): Promise<PlaceMention[]> {
  if (!mentions.length || !serverConfig.ollamaVideoLocationJsonFilter) {
    return mentions;
  }

  const uniqueNames = [...new Set(mentions.map((m) => m.name.trim()).filter(Boolean))];
  if (!uniqueNames.length) {
    return mentions;
  }

  const listed = uniqueNames.slice(0, 28);
  const transcriptChunks = buildTranscriptChunkStrings(ctx.preprocessedLines, 7000);

  const userContent = buildLocationFilteringPrompt({
    title: ctx.videoTitle,
    destination: ctx.destination,
    summary: "（擷取階段尚未產生全文摘要；請以逐字稿與候選地名為主。）",
    segmentTexts: [],
    transcriptChunks,
    candidateLocations: listed,
  });

  try {
    const raw = await chatWithOllama({
      format: "json",
      task: "location-filter",
      timeoutMs: Math.min(45_000, Math.max(14_000, Math.floor(serverConfig.ollamaTimeoutMs * 0.5))),
      messages: [
        {
          role: "system",
          content:
            "You filter travel-video location candidates for map geocoding. Output JSON only with acceptedLocations and rejectedLocations arrays.",
        },
        { role: "user", content: userContent },
      ],
    });
    const { acceptedLocations, parseFailed } = parseLocationFilterResponse(raw);
    if (parseFailed || !acceptedLocations.length) {
      return mentions;
    }

    const filtered = mentions.filter((m) => mentionMatchesAccepted(m.name, acceptedLocations));
    if (filtered.length < Math.max(1, Math.floor(mentions.length * 0.25))) {
      return mentions;
    }
    return filtered;
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[location-json-filter] skipped", error);
    }
    return mentions;
  }
}
