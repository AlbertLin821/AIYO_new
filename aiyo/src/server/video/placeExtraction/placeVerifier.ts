import { serverConfig } from "@/server/config";
import { evaluateGeocodeConfidenceGate, geocodeWithGoogle } from "@/server/geo/geocodeService";
import { findKnownLocationReference, resolveLocationReference } from "@/server/geo/locationCatalog";
import { searchWeb } from "@/server/search/searxngClient";
import { validatePoiNameQuality } from "@/server/video/placeExtraction/placeNameQualityGate";
import { scoreSearchEvidence } from "@/server/video/placeExtraction/searchEvidenceScorer";
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

    if (serverConfig.videoPlaceEnableNominatim) {
      const nominatim = await verifyWithNominatim(candidate.canonicalName, options?.destinationHint);
      if (nominatim) {
        verified.push(buildVerifiedPlace(candidate, nominatim));
        continue;
      }
    }

    if (options?.enableSearch) {
      const searchEvidence = await verifyWithSearchEvidence(candidate, options?.destinationHint);
      if (searchEvidence) {
        verified.push(buildVerifiedPlace(candidate, searchEvidence));
        continue;
      }
    }

    if (serverConfig.videoPlaceAllowHeuristicFallback) {
      const cappedHeuristicConfidence = Math.min(0.65, candidate.confidence);

      if (candidate.confidence >= 0.72 && isMapLikePlaceName(candidate.canonicalName)) {
        const fallback = resolveLocationReference(candidate.canonicalName, options?.destinationHint);
        verified.push(
          buildVerifiedPlace(candidate, {
            source: "heuristic",
            lat: fallback.lat,
            lng: fallback.lng,
            address: fallback.address,
            confidence: cappedHeuristicConfidence,
          }),
        );
      } else if (candidate.confidence >= 0.84) {
        verified.push(
          buildVerifiedPlace(candidate, {
            source: "heuristic",
            confidence: cappedHeuristicConfidence,
          }),
        );
      }
    }
  }

  return verified.sort((a, b) => {
    const aStart = a.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
    const bStart = b.firstMentionStartSeconds ?? Number.MAX_SAFE_INTEGER;
    return aStart - bStart;
  });
}

async function verifyWithSearchEvidence(
  candidate: CanonicalPlaceCandidate,
  destinationHint?: string,
): Promise<Partial<VerifiedVideoPlace> | null> {
  const queries = buildSearchQueries(candidate, destinationHint);
  const results = (
    await Promise.all(
      queries.map((query) =>
        searchWeb({
          query,
          limit: 5,
        }),
      ),
    )
  ).flat();
  const score = scoreSearchEvidence({
    candidateName: candidate.cleanedName,
    canonicalName: candidate.canonicalName,
    aliases: candidate.aliases,
    destinationHint,
    results,
  });
  if (!score.accepted) {
    return null;
  }
  return {
    source: "search",
    address: score.bestResult?.url,
    confidence: Math.min(1, Math.max(candidate.confidence, score.score)),
  };
}

function buildSearchQueries(candidate: CanonicalPlaceCandidate, destinationHint?: string): string[] {
  const queries = new Set<string>();
  const base = candidate.canonicalName;
  const destination = destinationHint?.trim();
  if (candidate.type === "station" || candidate.type === "transport_hub") {
    queries.add(`${base} 地址`);
    queries.add(`${base} station`);
  } else if (candidate.type === "restaurant" || candidate.type === "shop") {
    queries.add(`${base}${destination ? ` ${destination}` : ""} 地址`);
    queries.add(`${base}${destination ? ` ${destination}` : ""} restaurant`);
  } else {
    queries.add(`${base}${destination ? ` ${destination}` : ""} 景點 地址`);
    queries.add(`${base} travel attraction`);
    queries.add(`${base} Google Maps`);
  }
  if (destination) {
    queries.add(`${base} ${destination} 景點`);
  }
  return Array.from(queries);
}

async function verifyWithNominatim(
  name: string,
  destinationHint?: string,
): Promise<Partial<VerifiedVideoPlace> | null> {
  const query = [name, destinationHint].filter(Boolean).join(", ");
  if (!query) {
    return null;
  }
  try {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: "1",
    });
    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "User-Agent": "AIYO_new/1.0",
      },
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>;
    const first = payload[0];
    if (!first?.lat || !first?.lon) {
      return null;
    }
    return {
      source: "geocode",
      lat: Number(first.lat),
      lng: Number(first.lon),
      address: first.display_name,
      confidence: 0.74,
    };
  } catch {
    return null;
  }
}
