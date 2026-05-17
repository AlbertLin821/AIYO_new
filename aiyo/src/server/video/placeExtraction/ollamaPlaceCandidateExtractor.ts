import { chatWithOllama } from "@/server/ai/ollamaClient";
import { extractJsonBlock } from "@/server/ai/responseParser";
import { serverConfig } from "@/server/config";
import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";

export type OllamaExtractedPlaceCandidate = {
  name: string;
  type:
    | "attraction"
    | "restaurant"
    | "shop"
    | "station"
    | "transport_hub"
    | "market"
    | "district"
    | "hotel"
    | "airport"
    | "landmark"
    | "unknown";
  aliases?: string[];
  evidenceText: string;
  evidenceSource: "title" | "description" | "transcript";
  startSeconds?: number;
  confidence: number;
  reason: string;
};

const ALLOWED_TYPES = new Set<OllamaExtractedPlaceCandidate["type"]>([
  "attraction",
  "restaurant",
  "shop",
  "station",
  "transport_hub",
  "market",
  "district",
  "hotel",
  "airport",
  "landmark",
  "unknown",
]);

function buildTranscriptSnippet(lines: NormalizedTranscriptLine[], maxChars: number): string {
  const parts: string[] = [];
  let used = 0;
  for (const line of lines) {
    const fragment = `[${line.startSeconds}s] ${line.text}`.trim();
    if (used + fragment.length > maxChars) {
      break;
    }
    parts.push(fragment);
    used += fragment.length;
  }
  return parts.join("\n");
}

function normalizeCandidate(
  value: unknown,
  transcriptLines: NormalizedTranscriptLine[],
): OllamaExtractedPlaceCandidate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Record<string, unknown>;
  const name = String(row.name || "").trim();
  const evidenceText = String(row.evidenceText || "").trim();
  const evidenceSource = String(row.evidenceSource || "").trim() as OllamaExtractedPlaceCandidate["evidenceSource"];
  const reason = String(row.reason || "").trim();
  const rawType = String(row.type || "unknown").trim() as OllamaExtractedPlaceCandidate["type"];
  const type = ALLOWED_TYPES.has(rawType) ? rawType : "unknown";
  const confidence = Number(row.confidence);
  const startSecondsRaw = Number(row.startSeconds);
  const aliases = Array.isArray(row.aliases)
    ? row.aliases.map((alias) => String(alias).trim()).filter(Boolean).slice(0, 6)
    : undefined;
  if (!name || !evidenceText || !reason) {
    return null;
  }
  if (!["title", "description", "transcript"].includes(evidenceSource)) {
    return null;
  }
  const transcriptStartSeconds =
    evidenceSource === "transcript"
      ? transcriptLines.find((line) => line.text.includes(evidenceText))?.startSeconds
      : undefined;
  return {
    name,
    type,
    aliases,
    evidenceText,
    evidenceSource,
    startSeconds: Number.isFinite(startSecondsRaw) ? startSecondsRaw : transcriptStartSeconds,
    confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : 0.5,
    reason,
  };
}

export async function extractPlaceCandidatesWithOllama(input: {
  title: string;
  description?: string;
  transcriptLines: NormalizedTranscriptLine[];
  destinationHint?: string;
  maxCandidates?: number;
}): Promise<OllamaExtractedPlaceCandidate[]> {
  if (!serverConfig.videoPlaceEnableOllamaCandidates) {
    return [];
  }

  const prompt = [
    "You are a travel video place extraction engine.",
    "",
    "Your job is to extract ONLY real place names from the given YouTube video metadata and transcript.",
    "",
    "Use:",
    "1. Video title",
    "2. Video description",
    "3. Transcript lines",
    "",
    "Extract only:",
    "- attractions",
    "- landmarks",
    "- named restaurants",
    "- named shops",
    "- stations",
    "- bus terminals",
    "- airports",
    "- markets",
    "- night markets",
    "- districts",
    "- hotels",
    "- temples",
    "- shrines",
    "- museums",
    "- parks",
    "- streets",
    "- named POIs that can be found on a map",
    "",
    "Do NOT extract:",
    "- countries",
    "- generic city names only",
    "- generic regions",
    "- food dish names only",
    "- transportation phrases",
    "- full transcript sentences",
    "- sentence fragments",
    "- vague words",
    "- activities",
    "- itinerary concepts",
    "",
    "Examples of invalid outputs:",
    "- 從熊本車站",
    "- 直達熊本站",
    "- 走路去熊本城",
    "- 它就在熊本車站",
    "- 附近很多美食",
    "- 火雞肉飯",
    "- 日本",
    "- 大阪",
    "- 景點",
    "- 美食",
    "",
    "Examples of valid outputs:",
    "- 熊本城",
    "- 熊本車站",
    "- 熊本櫻町巴士總站",
    "- 草千里",
    "- 黑亭",
    "- 嘉義文化路夜市",
    "- 郭家火雞肉飯",
    "- Shibuya Station",
    "- Shibuya Crossing",
    "- Tokyo Tower",
    "",
    "Return JSON only:",
    "",
    "{",
    '  "places": [',
    "    {",
    '      "name": "canonical or best-known place name",',
    '      "type": "attraction | restaurant | shop | station | transport_hub | market | district | hotel | airport | landmark | unknown",',
    '      "aliases": ["optional aliases"],',
    '      "evidenceText": "exact short source phrase from title/description/transcript",',
    '      "evidenceSource": "title | description | transcript",',
    '      "startSeconds": 123,',
    '      "confidence": 0.0-1.0,',
    '      "reason": "why this is a real place"',
    "    }",
    "  ]",
    "}",
    "",
    "Rules:",
    "- If unsure, omit the candidate.",
    "- Never output full sentences as names.",
    "- Never output route phrases as names.",
    "- Prefer fewer but cleaner places.",
    "- Do not invent places not supported by evidence.",
    "",
    `Video title: ${input.title || "none"}`,
    `Destination hint: ${input.destinationHint || "unknown"}`,
    `Video description: ${input.description || "none"}`,
    "Transcript lines:",
    buildTranscriptSnippet(input.transcriptLines, 8000),
  ].join("\n");

  try {
    const raw = await chatWithOllama({
      task: "video-place-candidate-extract",
      format: "json",
      timeoutMs: Math.min(8_000, serverConfig.ollamaTimeoutMs),
      messages: [
        {
          role: "system",
          content: "Return valid JSON only. Do not use markdown fences. Do not explain.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });
    const block = extractJsonBlock(raw);
    if (!block) {
      return [];
    }
    const parsed = JSON.parse(block) as { places?: unknown[] };
    const candidates = Array.isArray(parsed.places)
      ? parsed.places
          .map((place) => normalizeCandidate(place, input.transcriptLines))
          .filter((place): place is OllamaExtractedPlaceCandidate => Boolean(place))
      : [];
    return candidates
      .slice(0, Math.max(1, input.maxCandidates ?? serverConfig.videoPlaceMaxCandidates))
      .sort((a, b) => {
        const sourceOrder = { title: 0, description: 1, transcript: 2 } as const;
        const bySource = sourceOrder[a.evidenceSource] - sourceOrder[b.evidenceSource];
        if (bySource !== 0) {
          return bySource;
        }
        return (a.startSeconds ?? Number.MAX_SAFE_INTEGER) - (b.startSeconds ?? Number.MAX_SAFE_INTEGER);
      });
  } catch {
    return [];
  }
}
