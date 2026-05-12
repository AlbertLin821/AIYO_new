import { evaluateGeocodeConfidenceGate, geocodeWithGoogle } from "@/server/geo/geocodeService";
import { findKnownLocationReference, resolveLocationReference } from "@/server/geo/locationCatalog";
import { searchWeb } from "@/server/search/searxngClient";
import { validatePoiNameQuality } from "@/server/video/placeExtraction/placeNameQualityGate";
import type { CanonicalPlaceCandidate, VerifiedVideoPlace } from "@/server/video/placeExtraction/types";

function isMapLikePlaceName(name: string): boolean {
  return /(?:車站|站|駅|Station|Crossing|Tower|Castle|Market|夜市|市場|商圈|城|寺|神社|街|洞|飯店|機場|港|Terminal|Cafe|Restaurant)$/iu.test(
    name,
  );
}

function buildVerifiedPlace(
  candidate: CanonicalPlaceCandidate,
  input: Partial<VerifiedVideoPlace>,
): VerifiedVideoPlace {
  return {
    id: candidate.canonicalId || candidate.canonicalName.toLowerCase().replace(/\s+/g, ""),
    name: candidate.canonicalName,
    canonicalName: candidate.canonicalName,
    aliases: candidate.aliases,
    confidence: candidate.confidence,
    source: "heuristic",
    evidenceTexts: Array.from(new Set((candidate.evidenceTexts || [candidate.rawText]).filter(Boolean))).slice(0, 3),
    firstMentionStartSeconds: candidate.startSeconds,
    firstMentionEndSeconds: candidate.endSeconds,
    sourceTranscriptLineIds: candidate.sourceTranscriptLineIds,
    ...input,
  };
}

export async function verifyCanonicalPlaces(
  candidates: CanonicalPlaceCandidate[],
  options?: {
    destinationHint?: string;
    enableGeocode?: boolean;
    enableSearch?: boolean;
  },
): Promise<VerifiedVideoPlace[]> {
  const verified: VerifiedVideoPlace[] = [];

  for (const candidate of candidates) {
    const quality = validatePoiNameQuality(candidate.canonicalName, {
      destinationHint: options?.destinationHint,
      allowDistrict: true,
      allowStation: true,
    });
    if (!quality.accepted) {
      continue;
    }

    const known = findKnownLocationReference(candidate.canonicalName);
    if (known) {
      verified.push(
        buildVerifiedPlace(candidate, {
          source: "gazetteer",
          lat: known.lat,
          lng: known.lng,
          address: known.address,
          type: candidate.type,
          confidence: Math.min(1, candidate.confidence + 0.18),
        }),
      );
      continue;
    }

    if (options?.enableGeocode) {
      const geo = await geocodeWithGoogle(candidate.canonicalName, options.destinationHint);
      if (geo.ok) {
        const gate = evaluateGeocodeConfidenceGate({
          rawMention: candidate.rawText,
          cleanedName: candidate.canonicalName,
          formattedAddress: geo.result.formattedAddress,
          resultName: candidate.canonicalName,
          types: geo.result.types,
          placeId: geo.result.placeId,
          baseConfidence: candidate.confidence,
        });
        if (gate.accepted) {
          verified.push(
            buildVerifiedPlace(candidate, {
              source: "geocode",
              lat: geo.result.lat,
              lng: geo.result.lng,
              address: geo.result.formattedAddress,
              confidence: Math.min(1, gate.confidence),
            }),
          );
          continue;
        }
      }
    }

    if (options?.enableSearch) {
      const searchResults = await searchWeb({
        query: options.destinationHint
          ? `${candidate.canonicalName} ${options.destinationHint}`
          : candidate.canonicalName,
        limit: 3,
      });
      const matched = searchResults.find((result) =>
        `${result.title} ${result.content}`.toLowerCase().includes(candidate.canonicalName.toLowerCase()),
      );
      if (matched) {
        verified.push(
          buildVerifiedPlace(candidate, {
            source: "search",
            address: matched.url,
            confidence: Math.min(1, candidate.confidence + 0.05),
          }),
        );
        continue;
      }
    }

    if (candidate.confidence >= 0.72 && isMapLikePlaceName(candidate.canonicalName)) {
      const fallback = resolveLocationReference(candidate.canonicalName, options?.destinationHint);
      verified.push(
        buildVerifiedPlace(candidate, {
          source: "heuristic",
          lat: fallback.lat,
          lng: fallback.lng,
          address: fallback.address,
          confidence: Math.min(0.82, candidate.confidence),
        }),
      );
    } else if (candidate.confidence >= 0.84) {
      verified.push(
        buildVerifiedPlace(candidate, {
          source: "heuristic",
          confidence: Math.min(0.78, candidate.confidence),
        }),
      );
    }
  }

  return verified.sort((a, b) => {
    const aStart = a.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
}
