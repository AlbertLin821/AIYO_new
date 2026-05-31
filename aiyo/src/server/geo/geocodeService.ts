import { serverConfig } from "@/server/config";
import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import {
  geocodeResultFailsDestinationScope,
  isGeocodeCountryInScope,
  isGeocodePointInScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import {
  mergeAndDedupeExtractions,
  type PlaceCandidate,
} from "@/server/geo/extractLocations";
import { findKnownLocationReference } from "@/server/geo/locationCatalog";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";
import type { PlaceMention } from "@/server/video/placeMentionExtractor";
import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";
import type { LocationReference } from "@/types";

export type GeocodeResult = {
  query: string;
  formattedAddress: string;
  lat: number;
  lng: number;
  placeId?: string;
  types: string[];
  countryCode?: string;
};

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    place_id?: string;
    types?: string[];
    address_components?: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
  }>;
};

type GooglePlaceDetailsResponse = {
  status: string;
  error_message?: string;
  result?: {
    name?: string;
    types?: string[];
    formatted_phone_number?: string;
    international_phone_number?: string;
    website?: string;
    url?: string;
    rating?: number;
    user_ratings_total?: number;
    opening_hours?: { weekday_text?: string[] };
    photos?: Array<{ photo_reference?: string }>;
  };
};

function buildQueryString(input: string, regionBias?: string): string {
  const base = input.trim();
  if (!base) {
    return base;
  }
  if (!regionBias?.trim()) {
    return base;
  }
  const bias = regionBias.trim();
  if (base.toLowerCase().includes(bias.toLowerCase())) {
    return base;
  }
  return `${base}, ${bias}`;
}

function extractCountryCode(
  components?: Array<{ short_name: string; types: string[] }>,
): string | undefined {
  const country = components?.find((c) => c.types.includes("country"));
  return country?.short_name;
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function destinationScopeFromHint(hint?: string): TripDestinationScope | null {
  return resolveTripDestinationScope(hint);
}

function scoreGeocodeTypes(types: string[]): number {
  if (!types.length) {
    return 0.45;
  }
  const t = new Set(types);
  if (
    t.has("establishment") ||
    t.has("point_of_interest") ||
    t.has("tourist_attraction") ||
    t.has("park") ||
    t.has("museum")
  ) {
    return 0.95;
  }
  if (t.has("premise") || t.has("subpremise")) {
    return 0.88;
  }
  if (t.has("sublocality") || t.has("neighborhood")) {
    return 0.82;
  }
  if (t.has("locality")) {
    return 0.62;
  }
  if (t.has("administrative_area_level_1") && types.length <= 2) {
    return 0.28;
  }
  if (t.has("country") && types.length <= 2) {
    return 0.12;
  }
  return 0.55;
}

function compactComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function similarityScore(left: string, right: string): number {
  const a = compactComparable(left);
  const b = compactComparable(right);
  if (!a || !b) {
    return 0;
  }
  if (a.includes(b) || b.includes(a)) {
    return Math.min(1, Math.min(a.length, b.length) / Math.max(a.length, b.length) + 0.35);
  }
  const chars = new Set([...a]);
  const overlap = [...new Set([...b])].filter((char) => chars.has(char)).length;
  return overlap / Math.max(new Set([...a, ...b]).size, 1);
}

function isSentenceLikeMention(raw: string, cleaned: string): boolean {
  const compactRaw = compactComparable(raw);
  const compactCleaned = compactComparable(cleaned);
  if (!compactRaw || compactRaw === compactCleaned) {
    return false;
  }
  return (
    compactRaw.length - compactCleaned.length >= 3 ||
    /(?:來到|前往|接著|然後|走路|就能|等.*回|附近很多|不用煩惱|可以|先|再)/u.test(raw)
  );
}

function isCityLevelTypes(types: string[]): boolean {
  const t = new Set(types);
  return (
    t.has("locality") ||
    t.has("administrative_area_level_1") ||
    t.has("administrative_area_level_2") ||
    t.has("political")
  ) && !(
    t.has("establishment") ||
    t.has("point_of_interest") ||
    t.has("tourist_attraction") ||
    t.has("restaurant") ||
    t.has("food") ||
    t.has("park") ||
    t.has("museum") ||
    t.has("transit_station")
  );
}

function isPreferredPlaceType(types: string[]): boolean {
  const t = new Set(types);
  return (
    t.has("establishment") ||
    t.has("tourist_attraction") ||
    t.has("point_of_interest") ||
    t.has("restaurant") ||
    t.has("food") ||
    t.has("park") ||
    t.has("museum") ||
    t.has("transit_station")
  );
}

export function evaluateGeocodeConfidenceGate(input: {
  rawMention: string;
  cleanedName: string;
  formattedAddress: string;
  resultName?: string;
  types: string[];
  placeId?: string;
  baseConfidence: number;
}): {
  accepted: boolean;
  confidence: number;
  matchReason: string;
  rejectedReason?: string;
} {
  const nameSimilarity = Math.max(
    similarityScore(input.cleanedName, input.resultName || ""),
    similarityScore(input.cleanedName, input.formattedAddress),
  );
  const cityLevel = isCityLevelTypes(input.types);
  const preferredType = isPreferredPlaceType(input.types);
  const sentenceLike = isSentenceLikeMention(input.rawMention, input.cleanedName);
  let confidence = input.baseConfidence;
  confidence = Math.min(1, confidence * 0.72 + nameSimilarity * 0.28);
  if (preferredType) {
    confidence += 0.08;
  }
  if (cityLevel) {
    confidence -= 0.28;
  }
  if (sentenceLike) {
    confidence -= 0.08;
  }
  if (!input.placeId) {
    confidence -= 0.1;
  }
  confidence = Math.max(0, Math.min(1, confidence));

  if (cityLevel && !preferredType) {
    return {
      accepted: false,
      confidence,
      matchReason: `similarity=${nameSimilarity.toFixed(2)}; types=${input.types.join("|") || "none"}`,
      rejectedReason: "city-level-geocode-result",
    };
  }
  if (nameSimilarity < 0.34 && !preferredType) {
    return {
      accepted: false,
      confidence,
      matchReason: `similarity=${nameSimilarity.toFixed(2)}; types=${input.types.join("|") || "none"}`,
      rejectedReason: "low-name-address-similarity",
    };
  }
  if (sentenceLike && confidence < 0.62) {
    return {
      accepted: false,
      confidence,
      matchReason: `similarity=${nameSimilarity.toFixed(2)}; sentence-like raw mention`,
      rejectedReason: "sentence-like-mention-low-confidence",
    };
  }

  return {
    accepted: confidence >= 0.52,
    confidence,
    matchReason: `similarity=${nameSimilarity.toFixed(2)}; preferredType=${preferredType}; types=${input.types.join("|") || "none"}`,
    rejectedReason: confidence >= 0.52 ? undefined : "below-confidence-threshold",
  };
}

function formattedAddressMentionsCandidate(
  formatted: string,
  displayName: string,
): boolean {
  const f = normalizeToken(formatted);
  const parts = displayName.split(/\s+/).filter((p) => p.length > 2);
  if (parts.length === 0) {
    return true;
  }
  return parts.some((p) => f.includes(normalizeToken(p)));
}

function combineConfidence(input: {
  rerankScore: number;
  typeScore: number;
  countryMatch: boolean;
  addressMatch: boolean;
}): number {
  const extractionNorm = Math.min(1, Math.max(0, input.rerankScore / 10));
  const countryFactor = input.countryMatch ? 1 : 0.22;
  const addrBoost = input.addressMatch ? 0.12 : 0;
  const geoQuality = input.typeScore * 0.55 + countryFactor * 0.45;
  return Math.min(
    1,
    extractionNorm * 0.38 + geoQuality * 0.5 + addrBoost,
  );
}

const DROP_CONFIDENCE_BELOW = 0.17;

function buildKnownCatalogLocation(
  cand: PlaceCandidate,
  reason: string,
): LocationReference | null {
  const extraction = cand.extraction;
  const known = findKnownLocationReference(extraction.displayName, reason);
  if (!known) {
    return null;
  }
  return {
    ...known,
    resolvedFrom: cand.source,
    rawQuery: extraction.raw,
    raw: extraction.raw,
    normalized: extraction.normalized,
    normalizedName: extraction.displayName,
    name: extraction.displayName,
    confidence: Math.min(0.48, Math.min(1, cand.rerankScore / 10) * 0.42),
    verified: false,
    description: `${known.description}（內部地名對照，仍需人工確認）`,
  };
}

function buildPhotoUrl(photoReference?: string): string | undefined {
  if (!photoReference || !serverConfig.googleMapsApiKey) {
    return undefined;
  }
  const params = new URLSearchParams({
    maxwidth: "480",
    photo_reference: photoReference,
    key: serverConfig.googleMapsApiKey,
  });
  return `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;
}

export async function fetchGooglePlaceDetailsByPlaceId(
  placeId?: string,
): Promise<Partial<LocationReference>> {
  if (!placeId || !serverConfig.googleMapsApiKey) {
    return {};
  }
  const params = new URLSearchParams({
    place_id: placeId,
    fields: "formatted_phone_number,international_phone_number,website,url,rating,user_ratings_total,opening_hours,photos",
    language: "zh-TW",
    key: serverConfig.googleMapsApiKey,
  });
  const url = `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`;
  try {
    const response = await fetch(url, { cache: "no-store" });
    const payload = (await response.json()) as GooglePlaceDetailsResponse;
    if (!response.ok || payload.status !== "OK" || !payload.result) {
      console.warn(
        `[place-details] failed placeId=${placeId} http=${response.status} status=${payload.status} message=${payload.error_message || ""}`,
      );
      return {};
    }
    const photoUrl = buildPhotoUrl(payload.result.photos?.[0]?.photo_reference);
    return {
      photoUrl,
      thumbnail: photoUrl,
      openingHours: payload.result.opening_hours?.weekday_text?.join("；"),
      phoneNumber: payload.result.formatted_phone_number || payload.result.international_phone_number,
      website: payload.result.website,
      googleMapsUrl: payload.result.url,
      rating: payload.result.rating,
      userRatingsTotal: payload.result.user_ratings_total,
    };
  } catch (error) {
    console.warn(
      `[place-details] request failed placeId=${placeId}: ${error instanceof Error ? error.message : String(error)}`,
    );
    return {};
  }
}

export async function geocodeWithGoogle(
  rawQuery: string,
  regionBias?: string,
  destinationScope?: TripDestinationScope | null,
): Promise<
  | { ok: true; result: GeocodeResult }
  | { ok: false; reason: string; googleStatus?: string }
> {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim() || serverConfig.googleMapsApiKey;
  if (!key) {
    return { ok: false, reason: "GOOGLE_MAPS_API_KEY is not configured." };
  }

  const address = buildQueryString(rawQuery, regionBias);
  const params = new URLSearchParams({
    address,
    key,
  });

  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geocoding request failed.";
    return { ok: false, reason: message };
  }

  const payload = (await response.json()) as GoogleGeocodeResponse;
  const status = payload.status;

  if (!response.ok) {
    return {
      ok: false,
      reason: payload.error_message || `Geocoding HTTP ${response.status}.`,
      googleStatus: status,
    };
  }

  if (status === "ZERO_RESULTS") {
    return { ok: false, reason: `No results for query: ${address}`, googleStatus: status };
  }

  if (status !== "OK" || !payload.results?.[0]) {
    return {
      ok: false,
      reason: payload.error_message || `Geocoding failed with status ${status}.`,
      googleStatus: status,
    };
  }

  const first = payload.results[0];
  const loc = first.geometry?.location;
  if (!loc || !isUsableMapCoordinate(loc.lat, loc.lng)) {
    return { ok: false, reason: "Geocoding response missing coordinates.", googleStatus: status };
  }

  const types = first.types || [];
  const countryCode = extractCountryCode(first.address_components);

  const scopeFailure = geocodeResultFailsDestinationScope(
    { countryCode, lat: loc.lat, lng: loc.lng },
    destinationScope,
  );
  if (scopeFailure) {
    return { ok: false, reason: scopeFailure, googleStatus: status };
  }

  return {
    ok: true,
    result: {
      query: rawQuery,
      formattedAddress: first.formatted_address || address,
      lat: loc.lat,
      lng: loc.lng,
      placeId: first.place_id,
      types,
      countryCode,
    },
  };
}

function sortLocationsForMap(locations: LocationReference[]): LocationReference[] {
  return [...locations].sort((a, b) => {
    const va = a.verified ? 1 : 0;
    const vb = b.verified ? 1 : 0;
    if (va !== vb) {
      return vb - va;
    }
    const ca = a.confidence ?? 0;
    const cb = b.confidence ?? 0;
    return cb - ca;
  });
}

/**
 * 對候選地點做 geocode、型別／國別／地址一致性檢查，並計算 confidence；過低者捨棄。
 */
export async function resolvePlaceExtractionsHybrid(
  candidates: PlaceCandidate[],
  options: {
    destinationHint?: string;
    transcriptContext?: string;
    destinationScope?: TripDestinationScope | null;
  },
): Promise<{
  locations: LocationReference[];
  failures: string[];
  mapsProvenance: "google-geocoding" | "catalog-fallback" | "mixed";
}> {
  const destinationHint = options.destinationHint;
  const destinationScope =
    options.destinationScope ?? destinationScopeFromHint(destinationHint);
  const locations: LocationReference[] = [];
  const failures: string[] = [];
  let googleCount = 0;
  let catalogCount = 0;

  if (!serverConfig.googleMapsApiKey) {
    for (const cand of candidates) {
      const extraction = cand.extraction;
      const known = buildKnownCatalogLocation(cand, "內部地名對照（未設定 Google Maps API 金鑰）。");
      if (known) {
        locations.push(known);
        catalogCount += 1;
        continue;
      }

      failures.push(`${extraction.displayName}：未設定 Google Maps API 金鑰且不在內部地名表，已略過。`);
    }

    return {
      locations: sortLocationsForMap(locations),
      failures,
      mapsProvenance: catalogCount > 0 ? "catalog-fallback" : "google-geocoding",
    };
  }

  for (const cand of candidates) {
    const extraction = cand.extraction;
    const resolved = await geocodeWithGoogle(extraction.displayName, destinationHint);

    if (resolved.ok) {
      const { result } = resolved;
      const typeScore = scoreGeocodeTypes(result.types);
      const countryInScope = isGeocodeCountryInScope(result.countryCode, destinationScope);
      const pointInScope = isGeocodePointInScope(result.lat, result.lng, destinationScope);
      const countryMatch = countryInScope && pointInScope;
      const addressMatch = formattedAddressMentionsCandidate(
        result.formattedAddress,
        extraction.displayName,
      );

      if (destinationScope?.countryCodes.length && result.countryCode && !countryInScope) {
        failures.push(
          `${extraction.displayName}：地理編碼國家（${result.countryCode}）與行程目的地不符，已略過。`,
        );
        continue;
      }
      if (destinationScope?.center && destinationScope.radiusKm && !pointInScope) {
        failures.push(
          `${extraction.displayName}：地理編碼座標超出目的地範圍，已略過。`,
        );
        continue;
      }

      let confidence = combineConfidence({
        rerankScore: cand.rerankScore,
        typeScore,
        countryMatch,
        addressMatch,
      });

      const gate = evaluateGeocodeConfidenceGate({
        rawMention: extraction.raw,
        cleanedName: extraction.displayName,
        formattedAddress: result.formattedAddress,
        types: result.types,
        placeId: result.placeId,
        baseConfidence: confidence,
      });
      confidence = gate.confidence;

      const verified =
        gate.accepted &&
        countryMatch &&
        typeScore >= 0.25 &&
        !(result.types.length <= 1 && result.types.includes("country"));

      if (!gate.accepted || confidence < DROP_CONFIDENCE_BELOW) {
        failures.push(
          `${extraction.displayName}：${gate.rejectedReason || "信心過低"}（${confidence.toFixed(2)}），已略過。`,
        );
        continue;
      }

      googleCount += 1;
      const details = await fetchGooglePlaceDetailsByPlaceId(result.placeId);
      locations.push({
        name: extraction.displayName,
        lat: result.lat,
        lng: result.lng,
        description: verified
          ? `已通過 Google 地理編碼驗證（${result.formattedAddress}）`
          : `Google 地理編碼結果，信心偏低（${result.formattedAddress}）`,
        address: result.formattedAddress,
        placeId: result.placeId,
        ...details,
        resolvedFrom: "google-geocode",
        rawQuery: extraction.raw,
        raw: extraction.raw,
        normalized: extraction.normalized,
        normalizedName: extraction.displayName,
        cleanedName: extraction.displayName,
        rawMention: extraction.raw,
        confidence,
        geocodeConfidence: confidence,
        geocodeMatchReason: gate.matchReason,
        geocodeRejectedReason: gate.rejectedReason,
        verified,
      });
      continue;
    }

    const known = buildKnownCatalogLocation(cand, "Google 查無或失敗，改用內部已知地名。");
    if (known && (cand.source === "title-poi" || cand.rerankScore >= 5)) {
      failures.push(`${extraction.displayName}：${resolved.reason}，改用內部已知地名。`);
      locations.push(known);
      catalogCount += 1;
      continue;
    }

    failures.push(`${extraction.displayName}：${resolved.reason}，未通過驗證已略過。`);
  }

  const mapsProvenance: "google-geocoding" | "catalog-fallback" | "mixed" =
    googleCount > 0 && catalogCount > 0
      ? "mixed"
      : googleCount > 0
        ? "google-geocoding"
        : "catalog-fallback";

  return {
    locations: sortLocationsForMap(locations),
    failures,
    mapsProvenance,
  };
}

export async function geocodeToLocationReferences(
  queries: string[],
  regionBias?: string,
): Promise<{
  locations: LocationReference[];
  failures: string[];
  provenance: "google-geocoding" | "catalog-fallback" | "mixed";
}> {
  const extractions = mergeAndDedupeExtractions(queries);
  const candidates: PlaceCandidate[] = extractions.map((extraction) => ({
    extraction,
    source: "heuristic",
    patternScore: 5,
    rerankScore: 5,
  }));
  const result = await resolvePlaceExtractionsHybrid(candidates, {
    destinationHint: regionBias,
    transcriptContext: "",
  });
  return {
    locations: result.locations,
    failures: result.failures,
    provenance: result.mapsProvenance,
  };
}

export async function resolvePlaceMentionsWithGeocode(input: {
  mentions: PlaceMention[];
  profile: TravelExtractionProfile;
  destinationHint?: string;
}): Promise<{
  locations: LocationReference[];
  failures: string[];
  mapsProvenance: "google-geocoding" | "catalog-fallback" | "mixed";
}> {
  const candidates: PlaceCandidate[] = input.mentions
    .filter(
      (mention) =>
        !isGenericTravelLocation({
          name: mention.name,
          destinationHint: input.destinationHint,
          profile: input.profile,
        }),
    )
    .map((mention) => ({
      extraction: {
        raw: mention.rawText,
        normalized: mention.normalizedName,
        displayName: mention.name,
      },
      source: "heuristic",
      patternScore: Math.max(2, Math.round(mention.confidence * 10)),
      rerankScore: Math.max(2, Math.round(mention.confidence * 10)),
    }));

  if (candidates.length === 0) {
    return { locations: [], failures: [], mapsProvenance: "catalog-fallback" };
  }

  const destinationScope = destinationScopeFromHint(input.destinationHint);
  const resolved = await resolvePlaceExtractionsHybrid(candidates, {
    destinationHint: input.destinationHint,
    transcriptContext: input.mentions.map((mention) => mention.context).join("\n"),
    destinationScope,
  });

  const enriched = resolved.locations.map((location) => {
    const match = input.mentions.find((mention) => mention.name === location.name);
    return {
      ...location,
      mentionedFoods: match?.foods,
      mentionContext: match?.context,
      sourceTranscriptLineIds: match?.sourceTranscriptLineIds,
      extractionSource: "deterministic" as const,
    };
  });

  return {
    locations: enriched,
    failures: resolved.failures,
    mapsProvenance: resolved.mapsProvenance,
  };
}
