import { canonicalizePlaceName } from "@/server/video/placeExtraction/canonicalPlaceResolver";
import { dedupeCanonicalPlaces } from "@/server/video/placeExtraction/placeDeduper";
import { validatePoiNameQuality } from "@/server/video/placeExtraction/placeNameQualityGate";
import { extractRawPlaceCandidates } from "@/server/video/placeExtraction/rawCandidateExtractor";
import type {
  CanonicalPlaceCandidate,
  FinalVideoPlaceExtractionInput,
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
  const rawCandidates = extractRawPlaceCandidates({
    transcriptLines: input.transcriptLines,
    title: input.title,
    description: input.description,
  });
  const rejectedCandidates: Array<{ rawText: string; rejectedReason: string }> = [];
  const canonicalCandidates: CanonicalPlaceCandidate[] = [];

  for (const candidate of rawCandidates) {
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
    .slice(0, 16);

  return {
    places: verified,
    rejectedCandidates,
    debug: {
      rawCandidateCount: rawCandidates.length,
      acceptedCanonicalCandidateCount: deduped.length,
      finalPlaceCount: verified.length,
      rejectedPlaceCandidateCount: rejectedCandidates.length,
      placeExtractionPipelineVersion: PLACE_EXTRACTION_PIPELINE_VERSION,
    },
  };
}
