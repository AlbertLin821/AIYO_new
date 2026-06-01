import { locationReferencesIncludeName } from "@/lib/locationNameMatch";
import { serverConfig } from "@/server/config";
import { findKnownLocationReference } from "@/server/geo/locationCatalog";
import { geocodePlace, mapGeocodedPlaceResolvedFrom } from "@/server/places/geocodePlace";
import type { TripDestinationScope } from "@/lib/tripDestinationScope";
import { canonicalizeSimplePlaceName } from "@/server/video/simpleExtraction/mergeExtractionResults";
import type { LocationReference, VideoSummarySegment } from "@/types";

const MAX_EXTRACTED_LOCATIONS = 16;

function dedupeLocationsByNormalizedName<T extends Pick<LocationReference, "name">>(locations: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const loc of locations) {
    const key = loc.name.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(loc);
  }
  return out;
}

function collectUniqueHintsFromSegments(segments: VideoSummarySegment[]): string[] {
  const seen = new Set<string>();
  const hints: string[] = [];
  for (const segment of segments) {
    for (const raw of segment.locationHints || []) {
      const trimmed = raw.trim();
      if (!trimmed) {
        continue;
      }
      const canonical = canonicalizeSimplePlaceName(trimmed);
      const key = canonical.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hints.push(canonical);
    }
  }
  return hints;
}

function buildUnverifiedLocationReference(hint: string): LocationReference {
  const description = `${hint}，影片中提到的地點（尚無法對應地圖座標）。`;
  return {
    name: hint,
    lat: Number.NaN,
    lng: Number.NaN,
    description,
    rawQuery: hint,
    raw: hint,
    normalized: hint,
    normalizedName: hint,
    cleanedName: hint,
    rawMention: hint,
    confidence: 0.35,
    verified: false,
    resolvedFrom: "llm",
    geocodeRejectedReason: "segment-hint-no-geocode",
    extractionSource: "ai-polished",
  };
}

async function resolveHintToLocation(input: {
  hint: string;
  destinationHint?: string;
  destinationScope?: TripDestinationScope | null;
}): Promise<LocationReference | null> {
  const description = `${input.hint}，影片中提到的地點。`;

  if (serverConfig.googleMapsApiKey) {
    const geocoded = await geocodePlace({
      query: input.hint,
      destinationHint: input.destinationHint,
      destinationScope: input.destinationScope,
    });
    if (geocoded.ok) {
      return {
        name: input.hint,
        lat: geocoded.place.lat,
        lng: geocoded.place.lng,
        description,
        address: geocoded.place.formattedAddress ?? undefined,
        placeId: geocoded.place.placeId ?? undefined,
        rawQuery: input.hint,
        raw: input.hint,
        normalized: input.hint,
        normalizedName: input.hint,
        cleanedName: input.hint,
        rawMention: input.hint,
        confidence: geocoded.place.confidence ?? 0.78,
        verified: true,
        resolvedFrom: mapGeocodedPlaceResolvedFrom(geocoded.place.provider),
        extractionSource: "ai-polished",
      };
    }
  }

  const known = findKnownLocationReference(input.hint, description);
  if (known) {
    return {
      ...known,
      name: input.hint,
      description,
      rawQuery: input.hint,
      raw: input.hint,
      normalized: input.hint,
      normalizedName: input.hint,
      cleanedName: input.hint,
      rawMention: input.hint,
      confidence: 0.42,
      verified: false,
      resolvedFrom: "llm",
      extractionSource: "ai-polished",
    };
  }

  return buildUnverifiedLocationReference(input.hint);
}

/**
 * Ensures every segment `locationHint` appears in `extractedLocations`, adding unverified
 * entries when geocode/catalog resolution failed during the initial map-ready pass.
 */
export async function syncExtractedLocationsWithSegments(input: {
  segments: VideoSummarySegment[];
  mapReadyLocations: LocationReference[];
  destinationHint?: string;
  destinationScope?: TripDestinationScope | null;
}): Promise<LocationReference[]> {
  const hints = collectUniqueHintsFromSegments(input.segments);
  const locations = [...input.mapReadyLocations];

  for (const hint of hints) {
    if (locationReferencesIncludeName(locations, hint)) {
      continue;
    }
    const resolved = await resolveHintToLocation({
      hint,
      destinationHint: input.destinationHint,
      destinationScope: input.destinationScope,
    });
    if (resolved) {
      locations.push(resolved);
    }
  }

  const deduped = dedupeLocationsByNormalizedName(locations);
  if (deduped.length <= MAX_EXTRACTED_LOCATIONS) {
    return deduped;
  }
  const withCoords = deduped.filter(
    (loc) => Number.isFinite(loc.lat) && Number.isFinite(loc.lng),
  );
  const withoutCoords = deduped.filter(
    (loc) => !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng),
  );
  return [...withCoords, ...withoutCoords].slice(0, MAX_EXTRACTED_LOCATIONS);
}

export function collectSegmentHintsNotInLocations(
  segments: VideoSummarySegment[],
  locations: LocationReference[],
): string[] {
  const orphans: string[] = [];
  const seen = new Set<string>();
  for (const segment of segments) {
    for (const raw of segment.locationHints || []) {
      const hint = canonicalizeSimplePlaceName(raw.trim());
      if (!hint) {
        continue;
      }
      const key = hint.replace(/\s+/g, "").toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      if (!locationReferencesIncludeName(locations, hint)) {
        orphans.push(hint);
      }
    }
  }
  return orphans;
}
