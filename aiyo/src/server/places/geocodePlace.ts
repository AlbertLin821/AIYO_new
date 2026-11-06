import {
  geocodeResultFailsDestinationScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import {
  evaluateGeocodeConfidenceGate,
  type GeocodeResult,
} from "@/server/geo/geocodeService";
import { searchPlacesByText, type PlaceSearchHit } from "@/server/geo/osmPlacesSearchService";
import type { GeocodedPlace, PlaceSuggestion } from "@/types/geocode";

export type GeocodePlaceInput = {
  query: string;
  destinationHint?: string | null;
  countryHint?: string | null;
  destinationScope?: TripDestinationScope | null;
};

export type GeocodePlaceSuccess = {
  ok: true;
  place: GeocodedPlace;
};

export type GeocodePlaceFailure = {
  ok: false;
  code: "missing_api_key" | "invalid_request" | "not_found" | "ambiguous" | "provider_error";
  message: string;
};

export type GeocodePlaceResult = GeocodePlaceSuccess | GeocodePlaceFailure;

const memoryCache = new Map<string, GeocodedPlace>();

const CROSS_LOCALE_ACCEPTED_REASONS = new Set([
  "low-name-address-similarity",
  "below-confidence-threshold",
]);

const CITY_LEVEL_TYPES = new Set([
  "locality",
  "administrative_area_level_1",
  "administrative_area_level_2",
  "administrative_area_level_3",
  "country",
  "political",
]);

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function cacheKey(input: GeocodePlaceInput): string {
  const query = normalizeQuery(input.query).toLowerCase();
  const hint = (input.destinationHint || "").trim().toLowerCase();
  const country = (input.countryHint || "").trim().toLowerCase();
  const scopeKey = (input.destinationScope?.countryCodes || []).join(",");
  return `${query}|${hint}|${country}|${scopeKey}`;
}

function resolveScope(input: GeocodePlaceInput): TripDestinationScope | null {
  if (input.destinationScope) {
    return input.destinationScope;
  }
  const hint = input.destinationHint?.trim();
  return hint ? resolveTripDestinationScope(hint) : null;
}

function candidatePassesDestinationScope(
  candidate: GeocodeResult,
  scope: TripDestinationScope | null,
): boolean {
  if (!scope?.countryCodes.length) {
    return true;
  }
  return (
    geocodeResultFailsDestinationScope(
      {
        countryCode: candidate.countryCode,
        lat: candidate.lat,
        lng: candidate.lng,
        formattedAddress: candidate.formattedAddress,
        placeName: candidate.query,
      },
      scope,
    ) === null
  );
}

function primaryCountryCode(scope: TripDestinationScope | null): string | undefined {
  const code = scope?.countryCodes?.[0]?.trim().toUpperCase();
  return code || undefined;
}

/** Bias Geocoding API response language; zh-TW default for Chinese queries. */
export function geocodeLanguageForScope(scope: TripDestinationScope | null): string {
  const code = primaryCountryCode(scope);
  if (code === "JP") {
    return "ja";
  }
  if (code === "KR") {
    return "ko";
  }
  if (code === "US" || code === "GB" || code === "AU") {
    return "en";
  }
  return "zh-TW";
}

function isCityLevelTypes(types: string[]): boolean {
  return types.some((type) => CITY_LEVEL_TYPES.has(type));
}

function isPreferredPlaceType(types: string[]): boolean {
  return types.some((type) =>
    [
      "point_of_interest",
      "establishment",
      "tourist_attraction",
      "museum",
      "restaurant",
      "cafe",
      "food",
      "shopping_mall",
      "park",
      "church",
      "place_of_worship",
      "train_station",
      "transit_station",
      "subway_station",
    ].includes(type),
  );
}

function scoreCandidate(query: string, candidate: GeocodeResult, destinationHint?: string): number {
  const gate = evaluateGeocodeConfidenceGate({
    rawMention: query,
    cleanedName: query,
    formattedAddress: candidate.formattedAddress,
    types: candidate.types,
    placeId: candidate.placeId,
    baseConfidence: candidate.placeId ? 0.88 : 0.72,
  });
  let score = gate.confidence;
  const hint = destinationHint?.trim().toLowerCase();
  if (hint) {
    const haystack = `${candidate.formattedAddress} ${candidate.query}`.toLowerCase();
    if (haystack.includes(hint)) {
      score += 0.12;
    }
  }
  return score;
}

function gateForCandidate(query: string, candidate: GeocodeResult) {
  return evaluateGeocodeConfidenceGate({
    rawMention: query,
    cleanedName: query,
    formattedAddress: candidate.formattedAddress,
    types: candidate.types,
    placeId: candidate.placeId,
    baseConfidence: candidate.placeId ? 0.88 : 0.72,
  });
}

function canAcceptCrossLocale(
  query: string,
  candidate: GeocodeResult,
  scope: TripDestinationScope | null,
): boolean {
  if (!scope?.countryCodes.length) {
    return false;
  }
  if (!candidate.placeId || !candidatePassesDestinationScope(candidate, scope)) {
    return false;
  }
  if (isCityLevelTypes(candidate.types) && !isPreferredPlaceType(candidate.types)) {
    return false;
  }
  const gate = gateForCandidate(query, candidate);
  if (gate.accepted) {
    return false;
  }
  if (!gate.rejectedReason || !CROSS_LOCALE_ACCEPTED_REASONS.has(gate.rejectedReason)) {
    return false;
  }
  return true;
}

function placeSearchHitToGeocodeResult(query: string, hit: PlaceSearchHit): GeocodeResult {
  return {
    query,
    formattedAddress: hit.formattedAddress || hit.name,
    lat: hit.lat,
    lng: hit.lng,
    placeId: hit.placeId.startsWith("noid_") ? undefined : hit.placeId,
    types: hit.types,
    countryCode: hit.countryCode,
  };
}

function pickBestPlaceSearchHit(
  query: string,
  hits: PlaceSearchHit[],
  destinationHint: string | undefined,
  scope: TripDestinationScope | null,
): GeocodePlaceResult | null {
  const normalizeName = (value: string) => value.toLowerCase().replace(/臺/g, "台").replace(/[\s,，、·・]/gu, "");
  const sought = normalizeName(destinationHint ? query.replace(destinationHint, "") : query);
  const candidates = hits
    .filter((hit) => sought.length >= 2 && normalizeName(hit.name).includes(sought))
    .map((hit) => ({ hit, candidate: placeSearchHitToGeocodeResult(query, {
      ...hit,
      formattedAddress: [hit.name, hit.formattedAddress].filter(Boolean).join(", "),
    }) }));
  const inScope = candidates.filter(({ candidate }) => candidatePassesDestinationScope(candidate, scope));
  if (!inScope.length) {
    return null;
  }

  const ranked = inScope
    .map(({ hit, candidate }) => ({
      hit,
      candidate,
      score: scoreCandidate(query, candidate, destinationHint),
      gate: gateForCandidate(query, candidate),
    }))
    .sort((a, b) => b.score - a.score);

  const chosen = ranked.find((entry) => entry.gate.accepted);
  if (!chosen) return null;

  const top = chosen.candidate;
  return {
    ok: true,
    place: {
      placeName: query,
      formattedAddress: top.formattedAddress,
      placeId: top.placeId ?? null,
      lat: top.lat,
      lng: top.lng,
      provider: chosen.hit.source === "overpass" ? "overpass" : "photon",
      confidence: chosen.score,
      sourceQuery: query,
      countryCode: top.countryCode ?? null,
      openingHours: chosen.hit.openingHours,
      phoneNumber: chosen.hit.phoneNumber,
      website: chosen.hit.website,
    },
  };
}

async function geocodePlaceViaTextSearch(
  input: GeocodePlaceInput,
  query: string,
  scope: TripDestinationScope | null,
): Promise<GeocodePlaceResult | null> {
  const locationHint =
    input.destinationHint?.trim() ||
    input.countryHint?.trim() ||
    scope?.canonicalLabel?.trim() ||
    undefined;
  const search = await searchPlacesByText(query, locationHint, { maxResults: 6 });
  if (!search.ok) {
    return null;
  }
  const matched = pickBestPlaceSearchHit(query, search.places, locationHint, scope);
  return matched;
}

export function clearGeocodeMemoryCacheForTests() {
  memoryCache.clear();
}

export async function geocodePlace(input: GeocodePlaceInput): Promise<GeocodePlaceResult> {
  const query = normalizeQuery(input.query);
  if (query.length < 2) {
    return { ok: false, code: "invalid_request", message: "地點名稱過短。" };
  }

  const key = cacheKey(input);
  const cached = memoryCache.get(key);
  if (cached) {
    return { ok: true, place: { ...cached, sourceQuery: query } };
  }

  const scope = resolveScope(input);
  const textSearch = await geocodePlaceViaTextSearch(input, query, scope);
  if (textSearch?.ok) {
    memoryCache.set(key, textSearch.place);
    return textSearch;
  }

  return { ok: false, code: "not_found", message: "找不到符合的地點。" };
}

export type SuggestPlacesResult =
  | { ok: true; suggestions: PlaceSuggestion[]; autoResolve: PlaceSuggestion | null }
  | { ok: false; code: GeocodePlaceFailure["code"]; message: string };

const AUTO_RESOLVE_MIN_CONFIDENCE = 0.82;
const AUTO_RESOLVE_MIN_GAP = 0.06;
const EXACT_MATCH_MIN_CONFIDENCE = 0.72;

function candidateToSuggestion(
  query: string,
  candidate: GeocodeResult,
  score: number,
): PlaceSuggestion {
  const displayName = candidate.formattedAddress?.split(",")[0]?.trim() || query;
  return {
    placeName: displayName,
    formattedAddress: candidate.formattedAddress,
    placeId: candidate.placeId ?? null,
    lat: candidate.lat,
    lng: candidate.lng,
    provider: "photon",
    confidence: score,
    sourceQuery: query,
    countryCode: candidate.countryCode ?? null,
  };
}

function hitToSuggestion(query: string, hit: PlaceSearchHit, score: number): PlaceSuggestion {
  return {
    placeName: hit.name,
    formattedAddress: hit.formattedAddress,
    placeId: hit.placeId.startsWith("noid_") ? null : hit.placeId,
    lat: hit.lat,
    lng: hit.lng,
    provider: hit.source === "overpass" ? "overpass" : "photon",
    confidence: score,
    sourceQuery: query,
    rating: hit.rating,
    userRatingsTotal: hit.userRatingsTotal,
    photoUrl: hit.photoUrl,
    thumbnail: hit.photoUrl,
    openingHours: hit.openingHours,
    phoneNumber: hit.phoneNumber,
    website: hit.website,
    googleMapsUrl: hit.googleMapsUrl,
  };
}

function rankCandidatesForSuggestions(
  query: string,
  candidates: GeocodeResult[],
  destinationHint: string | undefined,
  scope: TripDestinationScope | null,
): PlaceSuggestion[] {
  return candidates
    .filter((candidate) => candidatePassesDestinationScope(candidate, scope))
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(query, candidate, destinationHint),
      gate: gateForCandidate(query, candidate),
    }))
    .filter(
      (entry) =>
        entry.gate.accepted || canAcceptCrossLocale(query, entry.candidate, scope),
    )
    .sort((left, right) => right.score - left.score)
    .map((entry) => candidateToSuggestion(query, entry.candidate, entry.score));
}

function rankHitsForSuggestions(
  query: string,
  hits: PlaceSearchHit[],
  destinationHint: string | undefined,
  scope: TripDestinationScope | null,
): PlaceSuggestion[] {
  return hits
    .map((hit) => {
      const candidate = placeSearchHitToGeocodeResult(query, hit);
      return {
        hit,
        score: scoreCandidate(query, candidate, destinationHint),
        gate: gateForCandidate(query, candidate),
        candidate,
      };
    })
    .filter((entry) => candidatePassesDestinationScope(entry.candidate, scope))
    .filter(
      (entry) =>
        entry.gate.accepted || canAcceptCrossLocale(query, entry.candidate, scope),
    )
    .sort((left, right) => right.score - left.score)
    .map((entry) => hitToSuggestion(query, entry.hit, entry.score));
}

function rankCandidatesForSuggestionsRelaxed(
  query: string,
  candidates: GeocodeResult[],
  destinationHint: string | undefined,
): PlaceSuggestion[] {
  return candidates
    .map((candidate) => ({
      candidate,
      score: Math.min(0.68, scoreCandidate(query, candidate, destinationHint) * 0.8),
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => ({
      ...candidateToSuggestion(query, entry.candidate, entry.score),
      needsUserConfirm: true,
    }));
}

function rankHitsForSuggestionsRelaxed(
  query: string,
  hits: PlaceSearchHit[],
  destinationHint: string | undefined,
): PlaceSuggestion[] {
  return hits
    .map((hit) => {
      const candidate = placeSearchHitToGeocodeResult(query, hit);
      return {
        hit,
        score: Math.min(0.68, scoreCandidate(query, candidate, destinationHint) * 0.8),
      };
    })
    .sort((left, right) => right.score - left.score)
    .map((entry) => ({
      ...hitToSuggestion(query, entry.hit, entry.score),
      needsUserConfirm: true,
    }));
}

function countryOnlyScope(scope: TripDestinationScope | null): TripDestinationScope | null {
  if (!scope?.countryCodes.length) {
    return null;
  }
  return {
    ...scope,
    positiveTokens: [],
    negativeRegionTokens: [],
    isCountryLevel: true,
  };
}

export function mergeStrictAndRelaxedSuggestions(
  strict: PlaceSuggestion[],
  relaxed: PlaceSuggestion[],
  maxResults: number,
): PlaceSuggestion[] {
  const strictDeduped = dedupePlaceSuggestions(strict);
  const strictKeys = new Set(
    strictDeduped.map((item) => item.placeId?.trim() || `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`),
  );
  const relaxedOnly = dedupePlaceSuggestions(relaxed).filter((item) => {
    const key = item.placeId?.trim() || `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    return !strictKeys.has(key);
  });
  return dedupePlaceSuggestions([...strictDeduped, ...relaxedOnly]).slice(0, maxResults);
}

function dedupePlaceSuggestions(items: PlaceSuggestion[]): PlaceSuggestion[] {
  const seen = new Set<string>();
  const ranked = [...items].sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0));
  const out: PlaceSuggestion[] = [];
  for (const item of ranked) {
    const key = item.placeId?.trim() || `${item.lat.toFixed(4)},${item.lng.toFixed(4)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function pickAutoResolveSuggestion(
  query: string,
  suggestions: PlaceSuggestion[],
): PlaceSuggestion | null {
  if (!suggestions.length) {
    return null;
  }

  const top = suggestions[0]!;
  const runnerUp = suggestions[1];
  const normalizedQuery = normalizeQuery(query).toLowerCase();
  const topName = normalizeQuery(top.placeName).toLowerCase();
  const topAddress = normalizeQuery(top.formattedAddress || "").toLowerCase();
  const exactNameMatch = topName === normalizedQuery;
  const addressContainsQuery = normalizedQuery.length >= 2 && topAddress.includes(normalizedQuery);
  const topScore = top.confidence ?? 0;
  const runnerScore = runnerUp?.confidence ?? 0;

  if (exactNameMatch && topScore >= EXACT_MATCH_MIN_CONFIDENCE) {
    return top;
  }

  if (addressContainsQuery && topScore >= EXACT_MATCH_MIN_CONFIDENCE && topScore - runnerScore >= AUTO_RESOLVE_MIN_GAP) {
    return top;
  }

  if (topScore >= AUTO_RESOLVE_MIN_CONFIDENCE && topScore - runnerScore >= AUTO_RESOLVE_MIN_GAP) {
    return top;
  }

  return null;
}

export async function suggestPlacesForQuery(
  input: GeocodePlaceInput,
  options?: { maxResults?: number },
): Promise<SuggestPlacesResult> {
  const query = normalizeQuery(input.query);
  if (query.length < 2) {
    return { ok: false, code: "invalid_request", message: "地點名稱過短。" };
  }

  const maxResults = Math.min(8, Math.max(1, options?.maxResults ?? 5));
  const scope = resolveScope(input);
  const locationHint =
    input.destinationHint?.trim() ||
    input.countryHint?.trim() ||
    scope?.canonicalLabel?.trim() ||
    undefined;
  const destinationHint = input.destinationHint || undefined;

  const strictSuggestions: PlaceSuggestion[] = [];
  const relaxedSuggestions: PlaceSuggestion[] = [];
  const search = await searchPlacesByText(query, locationHint, { maxResults: 6 });
  if (search.ok && search.places.length) {
    strictSuggestions.push(
      ...rankHitsForSuggestions(query, search.places, locationHint, scope),
    );
    relaxedSuggestions.push(
      ...rankHitsForSuggestionsRelaxed(query, search.places, locationHint),
    );
  }

  const strictDeduped = dedupePlaceSuggestions(strictSuggestions);
  let merged = mergeStrictAndRelaxedSuggestions(strictDeduped, relaxedSuggestions, maxResults);

  if (!merged.length && search.ok && search.places.length) {
    merged = rankHitsForSuggestionsRelaxed(query, search.places, locationHint).slice(0, maxResults);
  }

  if (!merged.length && scope?.countryCodes.length) {
    const countryScope = countryOnlyScope(scope);
    const countryStrict: PlaceSuggestion[] = [];
    const countryRelaxed: PlaceSuggestion[] = [];
    if (search.ok && search.places.length) {
      countryStrict.push(
        ...rankHitsForSuggestions(query, search.places, locationHint, countryScope),
      );
      countryRelaxed.push(
        ...rankHitsForSuggestionsRelaxed(query, search.places, locationHint),
      );
    }
    merged = mergeStrictAndRelaxedSuggestions(
      dedupePlaceSuggestions(countryStrict),
      countryRelaxed,
      maxResults,
    );
    if (!merged.length && search.ok) {
      merged = rankHitsForSuggestionsRelaxed(query, search.places, locationHint).slice(0, maxResults);
    }
  }

  if (!merged.length) {
    const searchFallback = await searchPlacesByText(query, undefined, { maxResults: 6 });
    if (searchFallback.ok && searchFallback.places.length) {
      merged = rankHitsForSuggestionsRelaxed(query, searchFallback.places, undefined).slice(
        0,
        maxResults,
      );
    }
  }

  if (!merged.length) {
    return { ok: false, code: "not_found", message: "找不到符合的地點。" };
  }

  return {
    ok: true,
    suggestions: merged,
    autoResolve: pickAutoResolveSuggestion(query, strictDeduped),
  };
}

export { mapGeocodedPlaceResolvedFrom } from "@/lib/places/geocodeUtils";
