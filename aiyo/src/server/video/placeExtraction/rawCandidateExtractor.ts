import type { NormalizedTranscriptLine } from "@/server/video/transcriptProcessing";
import type { RawPlaceCandidate } from "@/server/video/placeExtraction/types";

const CJK_POI_PATTERN =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]{2,20}(?:車站|站|駅|入口站|巴士總站|バスターミナル|商圈|夜市|市場|老街|城|塔|公園|博物館|美術館|寺|神社|宮|街|洞|飯店|酒店|旅館|港|機場|觀景台|餐廳|咖啡廳|咖啡館))/gu;
const ENGLISH_POI_PATTERN =
  /\b([A-Z][A-Za-z0-9'&.-]*(?:\s+[A-Z][A-Za-z0-9'&.-]*){0,5}\s+(?:Station|Crossing|Tower|Castle|Market|Temple|Shrine|Park|Museum|Cafe|Restaurant|Hotel|Airport|Port|Terminal|Street))\b/g;
const NAMED_FOOD_SHOP_PATTERN =
  /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]{2,16}(?:火雞肉飯|雞肉飯|砂鍋魚頭|拉麵|咖啡|咖啡館))/gu;

function splitMetadata(text: string): string[] {
  return text
    .split(/\n|(?<=[。！？!?])\s*/u)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length >= 2 && chunk.length <= 120);
}

function extractExplicitMatches(text: string): string[] {
  const matches: string[] = [];
  const patterns = [CJK_POI_PATTERN, ENGLISH_POI_PATTERN, NAMED_FOOD_SHOP_PATTERN];
  for (const pattern of patterns) {
    let match: RegExpExecArray | null = pattern.exec(text);
    while (match) {
      matches.push(match[1]);
      match = pattern.exec(text);
    }
    pattern.lastIndex = 0;
  }
  return Array.from(new Set(matches));
}

function dedupeCandidates(candidates: RawPlaceCandidate[]): RawPlaceCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = [
      candidate.source,
      candidate.rawText.trim().toLowerCase(),
      candidate.startSeconds ?? "na",
      (candidate.sourceTranscriptLineIds || []).join(","),
    ].join(":");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function extractRawPlaceCandidates(input: {
  transcriptLines: NormalizedTranscriptLine[];
  title: string;
  description?: string;
}): RawPlaceCandidate[] {
  const candidates: RawPlaceCandidate[] = [];

  for (const line of input.transcriptLines) {
    candidates.push({
      rawText: line.text,
      cleanedText: line.text,
      source: "transcript",
      startSeconds: line.startSeconds,
      endSeconds: line.endSeconds,
      context: line.text,
      confidence: 0.62,
      sourceTranscriptLineIds: [line.id],
    });
    for (const match of extractExplicitMatches(line.text)) {
      candidates.push({
        rawText: match,
        cleanedText: match,
        source: "transcript",
        startSeconds: line.startSeconds,
        endSeconds: line.endSeconds,
        context: line.text,
        confidence: 0.76,
        sourceTranscriptLineIds: [line.id],
      });
    }
  }

  for (const text of splitMetadata(input.title)) {
    candidates.push({
      rawText: text,
      cleanedText: text,
      source: "title",
      context: input.title,
      confidence: 0.58,
    });
    for (const match of extractExplicitMatches(text)) {
      candidates.push({
        rawText: match,
        cleanedText: match,
        source: "title",
        context: input.title,
        confidence: 0.72,
      });
    }
  }

  for (const text of splitMetadata(input.description || "")) {
    candidates.push({
      rawText: text,
      cleanedText: text,
      source: "description",
      context: text,
      confidence: 0.48,
    });
    for (const match of extractExplicitMatches(text)) {
      candidates.push({
        rawText: match,
        cleanedText: match,
        source: "description",
        context: text,
        confidence: 0.64,
      });
    }
  }

  return dedupeCandidates(candidates);
}
