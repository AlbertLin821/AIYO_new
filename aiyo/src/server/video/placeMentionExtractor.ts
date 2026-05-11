import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";
import { cleanPlaceMentionName } from "@/server/video/placeMentionNormalizer";
import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";

export type PlaceMention = {
  rawText: string;
  name: string;
  normalizedName: string;
  startSeconds: number;
  endSeconds: number;
  context: string;
  source: "regex" | "chapter" | "title" | "ai" | "profile-pattern";
  confidence: number;
  matchedPattern?: string;
  foods?: string[];
  sourceTranscriptLineIds?: string[];
  timestampSource?: "youtube-transcript" | "description-fallback";
  timestampConfidence?: "high" | "low";
};

function normalizeName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function stripEnglishLeadIn(name: string): string {
  return name
    .replace(
      /^(?:we\s+(?:visit|walk around|are at|are now at)|we're at|this is|next stop is|famous for|at|visit|walk around)\s+/i,
      "",
    )
    .replace(/^(?:and|the)\s+/i, "")
    .trim();
}

function stripPrefix(name: string, profile: TravelExtractionProfile): string {
  let out = stripEnglishLeadIn(name.trim());
  for (const prefix of profile.fillerPrefixes) {
    if (!prefix) {
      continue;
    }
    if (out.toLowerCase().startsWith(prefix.toLowerCase())) {
      out = out.slice(prefix.length).trim();
    }
  }
  return stripEnglishLeadIn(out.replace(/^(這間|這家|來到|下一站|推薦|必吃|必去)\s*/i, "")).trim();
}

function collectFoods(text: string, profile: TravelExtractionProfile): string[] {
  const lower = text.toLowerCase();
  return profile.foodTerms.filter((term) => lower.includes(term.toLowerCase()));
}

/** 僅允許短店名前綴；林聰明、民主等通常 <=3 字，過長易誤掃整句。 */
const MAX_FOOD_STORE_PREFIX_CHARS = 3;

function extractByFoodTerms(text: string, profile: TravelExtractionProfile): string[] {
  const out = new Set<string>();
  for (const food of profile.foodTerms) {
    const escaped = food.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(
      `([\\p{L}\\p{N}A-Za-z]{0,${MAX_FOOD_STORE_PREFIX_CHARS}}${escaped})`,
      "giu",
    );
    let match: RegExpExecArray | null = re.exec(text);
    while (match) {
      const candidate = match[1]?.trim();
      if (candidate && candidate.length >= food.length) {
        out.add(candidate);
      }
      match = re.exec(text);
    }
  }
  return Array.from(out);
}

/** 純食物詞不應成為地點 mention（可留在 collectFoods／segments 的 foods）。具名店家保留。 */
function isPureFoodName(name: string, profile: TravelExtractionProfile): boolean {
  const n = name.trim();
  if (!n) {
    return false;
  }
  const lower = n.toLowerCase();
  return profile.foodTerms.some((term) => n === term || lower === term.toLowerCase());
}

function extractBySuffix(text: string, profile: TravelExtractionProfile): string[] {
  const out = new Set<string>();
  for (const suffix of profile.placeSuffixes) {
    const escaped = suffix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`([\\p{L}\\p{N}A-Za-z\\-\\s]{1,30}${escaped})`, "giu");
    let match: RegExpExecArray | null = re.exec(text);
    while (match) {
      const v = match[1]?.trim();
      if (v && v.length > 1) {
        const cleaned = stripEnglishLeadIn(v);
        const parts = cleaned.split(/\s+(?:and|&)\s+/i).map((part) => stripEnglishLeadIn(part));
        for (const part of parts) {
          if (part.length > 1) {
            out.add(part);
          }
        }
      }
      match = re.exec(text);
    }
  }
  return Array.from(out);
}

export function extractTimestampAwarePlaceMentions(input: {
  lines: NormalizedTranscriptLine[];
  profile: TravelExtractionProfile;
  destinationHint?: string;
}): PlaceMention[] {
  const mentions: PlaceMention[] = [];

  for (const line of input.lines) {
    const lineFoods = collectFoods(line.text, input.profile);
    const candidates = new Set<string>([
      ...extractBySuffix(line.text, input.profile),
      ...extractByFoodTerms(line.text, input.profile),
    ]);

    for (const pattern of input.profile.poiPatterns) {
      const matches = line.text.match(pattern) || [];
      matches.forEach((match) => candidates.add(match));
    }

    // 引號包住的名稱常是店名
    const quoted = line.text.match(/["「『](.{2,30})["」』]/g) || [];
    quoted.forEach((v) => candidates.add(v.replace(/["「『」』]/g, "")));

    for (const rawCandidate of candidates) {
      const prefixed = stripPrefix(normalizeName(rawCandidate), input.profile);
      const cleanResult = cleanPlaceMentionName(prefixed || rawCandidate, input.profile, input.destinationHint);
      const cleaned = cleanResult.cleanedName;
      if (!cleaned || cleaned.length < 2) {
        continue;
      }
      if (cleanResult.rejectedReason) {
        continue;
      }
      if (isPureFoodName(cleaned, input.profile)) {
        continue;
      }
      if (isGenericTravelLocation({ name: cleaned, destinationHint: input.destinationHint, profile: input.profile })) {
        continue;
      }
      const hasSuffix = input.profile.placeSuffixes.some((suffix) =>
        cleaned.toLowerCase().includes(suffix.toLowerCase()),
      );
      const confidence = Math.max(0.35, Math.min(0.98, (hasSuffix ? 0.72 : 0.45) + Math.min(0.2, lineFoods.length * 0.05)));
      mentions.push({
        rawText: rawCandidate,
        name: cleaned,
        normalizedName: cleaned.toLowerCase().replace(/\s+/g, ""),
        startSeconds: line.startSeconds,
        endSeconds: line.endSeconds,
        context: line.text,
        source: "profile-pattern",
        confidence,
        matchedPattern: hasSuffix ? "suffix" : "pattern",
        foods: lineFoods.length ? lineFoods : undefined,
        sourceTranscriptLineIds: [line.id],
        timestampSource: line.timestampSource,
        timestampConfidence: line.timestampConfidence,
      });
    }
  }

  return mentions;
}
