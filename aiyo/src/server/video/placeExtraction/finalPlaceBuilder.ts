import { serverConfig } from "@/server/config";
import { canonicalizePlaceName } from "@/server/video/placeExtraction/canonicalPlaceResolver";
import { dedupeCanonicalPlaces } from "@/server/video/placeExtraction/placeDeduper";
import { extractPlaceCandidatesWithOllama } from "@/server/video/placeExtraction/ollamaPlaceCandidateExtractor";
import { validatePoiNameQuality } from "@/server/video/placeExtraction/placeNameQualityGate";
import { extractRawPlaceCandidates } from "@/server/video/placeExtraction/rawCandidateExtractor";
import type {
  CanonicalPlaceCandidate,
  FinalVideoPlaceExtractionInput,
  RawPlaceCandidate,
  VerifiedVideoPlace,
} from "@/server/video/placeExtraction/types";
import { verifyCanonicalPlaces } from "@/server/video/placeExtraction/placeVerifier";

const PLACE_EXTRACTION_PIPELINE_VERSION = "place-extraction-v1";

function inferCandidateType(name: string): string | undefined {
  if (/(?:車站|站|駅|Station|Terminal|巴士總站)$/iu.test(name)) {
    return "station";
  }
  if (/(?:夜市|市場|老街|商圈|街|洞|Crossing|Street)$/iu.test(name)) {
    return "district";
  }
  if (/(?:餐廳|咖啡廳|咖啡館|Restaurant|Cafe|飯店|Hotel|火雞肉飯|雞肉飯|拉麵)$/iu.test(name)) {
    return "shop";
  }
  if (/(?:城|塔|寺|神社|公園|博物館|美術館|機場|港|Castle|Tower|Temple|Shrine|Park|Museum|Airport|Port)$/iu.test(name)) {
    return "landmark";
  }
  return undefined;
}

function baseConfidenceForSource(source: CanonicalPlaceCandidate["source"]): number {
  switch (source) {
    case "title":
      return 0.66;
    case "description":
      return 0.58;
    case "transcript":
      return 0.72;
    default:
      return 0.55;
  }
}

function uniqueVerifiedPlaces(places: VerifiedVideoPlace[]): VerifiedVideoPlace[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    const key = place.id || place.canonicalName.toLowerCase().replace(/\s+/g, "");
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function sourceToEvidenceSource(source: RawPlaceCandidate["source"]): CanonicalPlaceCandidate["evidenceSource"] {
  switch (source) {
    case "title":
      return "title";
    case "description":
      return "description";
    case "transcript":
      return "transcript";
    case "chapter":
      return "chapter";
    case "llm":
      return "llm";
    default:
      return "transcript";
  }
}

function evidenceExistsInInputs(input: FinalVideoPlaceExtractionInput, evidenceText: string): boolean {
  if (!evidenceText.trim()) {
    return false;
  }
  if (input.title.includes(evidenceText)) {
    return true;
  }
  if ((input.description || "").includes(evidenceText)) {
    return true;
  }
  return input.transcriptLines.some((line) => line.text.includes(evidenceText) || line.rawText.includes(evidenceText));
}

function mergeCandidateSources(input: {
  regexCandidates: RawPlaceCandidate[];
  ollamaCandidates: Awaited<ReturnType<typeof extractPlaceCandidatesWithOllama>>;
  transcriptLines: FinalVideoPlaceExtractionInput["transcriptLines"];
}): RawPlaceCandidate[] {
  const merged: RawPlaceCandidate[] = [...input.regexCandidates];
  for (const candidate of input.ollamaCandidates) {
    const matchedLine =
      candidate.evidenceSource === "transcript"
        ? input.transcriptLines.find((line) => line.text.includes(candidate.evidenceText))
        : undefined;
    merged.push({
      rawText: candidate.name,
      cleanedText: candidate.name,
      source: "llm",
      startSeconds: candidate.startSeconds ?? matchedLine?.startSeconds,
      endSeconds: matchedLine?.endSeconds,
      context: candidate.evidenceText,
      confidence: candidate.confidence,
      sourceTranscriptLineIds: matchedLine ? [matchedLine.id] : undefined,
    });
  }
  return merged;
}

export async function extractFinalVideoPlaces(
  input: FinalVideoPlaceExtractionInput,
): Promise<{
  places: VerifiedVideoPlace[];
  rejectedCandidates: Array<{
    rawText: string;
    rejectedReason: string;
  }>;
  debug?: unknown;
}> {
  const regexCandidates = extractRawPlaceCandidates({
    transcriptLines: input.transcriptLines,
    title: input.title,
    description: input.description,
  });
  const ollamaCandidates = await extractPlaceCandidatesWithOllama({
    title: input.title,
    description: input.description,
    transcriptLines: input.transcriptLines,
    destinationHint: input.destinationHint,
    maxCandidates: serverConfig.videoPlaceMaxCandidates,
  });
  const rawCandidates = mergeCandidateSources({
    regexCandidates,
    ollamaCandidates,
    transcriptLines: input.transcriptLines,
  }).slice(0, serverConfig.videoPlaceMaxCandidates);
  const rejectedCandidates: Array<{ rawText: string; rejectedReason: string }> = [];
  const canonicalCandidates: CanonicalPlaceCandidate[] = [];

  for (const candidate of rawCandidates) {
    if (candidate.source === "llm") {
      const matchedOllamaCandidate = ollamaCandidates.find(
        (item) => item.name === (candidate.cleanedText || candidate.rawText) && item.evidenceText === candidate.context,
      );
      if (!matchedOllamaCandidate?.evidenceText) {
        rejectedCandidates.push({
          rawText: candidate.rawText,
          rejectedReason: "llm-missing-evidence-text",
        });
        continue;
      }
      if (!evidenceExistsInInputs(input, matchedOllamaCandidate.evidenceText)) {
        rejectedCandidates.push({
          rawText: candidate.rawText,
          rejectedReason: "llm-evidence-not-found-in-inputs",
        });
        continue;
      }
    }
    const quality = validatePoiNameQuality(candidate.cleanedText || candidate.rawText, {
      destinationHint: input.destinationHint,
      allowDistrict: true,
      allowStation: true,
    });
    if (!quality.accepted || !quality.cleanedName) {
      rejectedCandidates.push({
        rawText: candidate.rawText,
        rejectedReason: quality.rejectedReason || "quality-rejected",
      });
      continue;
    }

    const canonical = canonicalizePlaceName(quality.cleanedName, {
      destinationHint: input.destinationHint,
    });
    const finalQuality = validatePoiNameQuality(canonical.canonicalName, {
      destinationHint: input.destinationHint,
      allowDistrict: true,
      allowStation: true,
    });
    if (!finalQuality.accepted) {
      rejectedCandidates.push({
        rawText: candidate.rawText,
        rejectedReason: finalQuality.rejectedReason || "canonical-quality-rejected",
      });
      continue;
    }

    canonicalCandidates.push({
      rawText: candidate.rawText,
      cleanedName: quality.cleanedName,
      canonicalName: canonical.canonicalName,
      canonicalId: canonical.canonicalId,
      aliases: canonical.aliases,
      type: inferCandidateType(canonical.canonicalName),
      source: candidate.source,
      startSeconds: candidate.startSeconds,
      endSeconds: candidate.endSeconds,
      context: candidate.context,
      confidence: Math.min(
        0.98,
        (candidate.confidence ?? baseConfidenceForSource(candidate.source)) + canonical.confidenceBoost,
      ),
      sourceTranscriptLineIds: candidate.sourceTranscriptLineIds,
      evidenceTexts: Array.from(new Set([candidate.rawText, candidate.context || ""])).filter(Boolean),
      evidenceSource: sourceToEvidenceSource(candidate.source),
    });
  }

  const deduped = dedupeCanonicalPlaces(canonicalCandidates);
  const verified = uniqueVerifiedPlaces(
    await verifyCanonicalPlaces(deduped, {
      destinationHint: input.destinationHint,
      enableGeocode: input.enableGeocode,
      enableSearch: input.enableSearch,
    }),
  )
    .sort((a, b) => {
      const aStart = a.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
      const bStart = b.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
      return aStart - bStart;
    })
    .slice(0, serverConfig.videoPlaceMaxFinalPlaces);

  return {
    places: verified,
    rejectedCandidates,
    debug: {
      rawCandidateCount: rawCandidates.length,
      regexCandidateCount: regexCandidates.length,
      ollamaCandidateCount: ollamaCandidates.length,
      acceptedCanonicalCandidateCount: deduped.length,
      finalPlaceCount: verified.length,
      rejectedPlaceCandidateCount: rejectedCandidates.length,
      placeExtractionPipelineVersion: PLACE_EXTRACTION_PIPELINE_VERSION,
    },
  };
}
