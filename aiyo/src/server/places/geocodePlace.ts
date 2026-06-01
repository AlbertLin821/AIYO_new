import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import {
  isGeocodeCountryInScope,
  isGeocodePointInScope,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import {
  evaluateGeocodeConfidenceGate,
  type GeocodeResult,
} from "@/server/geo/geocodeService";
import { searchPlacesByText, type PlaceSearchHit } from "@/server/geo/placesSearchService";
import type { GeocodeProvider, GeocodedPlace } from "@/types/geocode";

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
  if (candidate.countryCode && !isGeocodeCountryInScope(candidate.countryCode, scope)) {
    return false;
  }
  if (!isGeocodePointInScope(candidate.lat, candidate.lng, scope)) {
    return false;
  }
  if (!candidate.countryCode) {
    const addressBlob = `${candidate.formattedAddress} ${candidate.query}`;
    if (!isTextInTripDestinationScope(addressBlob, scope, { strictCountryLevel: false })) {
      return false;
    }
  }
  return true;
}

function buildRegionBias(input: GeocodePlaceInput): string | undefined {
  const parts = [input.destinationHint, input.countryHint]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : undefined;
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

type GoogleGeocodeResponse = {
  status: string;
  error_message?: string;
  results?: Array<{
    formatted_address?: string;
    geometry?: { location?: { lat: number; lng: number } };
    place_id?: string;
    types?: string[];
    address_components?: Array<{ short_name: string; types: string[] }>;
  }>;
};

function toGeocodeResult(query: string, row: NonNullable<GoogleGeocodeResponse["results"]>[number]): GeocodeResult | null {
  const loc = row.geometry?.location;
  if (!loc || !isUsableMapCoordinate(loc.lat, loc.lng)) {
    return null;
  }
  return {
    query,
    formattedAddress: row.formatted_address || query,
    lat: loc.lat,
    lng: loc.lng,
    placeId: row.place_id,
    types: row.types || [],
    countryCode: row.address_components?.find((c) => c.types.includes("country"))?.short_name,
  };
}

function readGoogleMapsApiKey(): string {
  const fromEnv = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return fromEnv || "";
}

async function fetchGeocodeCandidates(
  query: string,
  regionBias: string | undefined,
  options: { countryCode?: string; language: string },
): Promise<
  | { ok: true; candidates: GeocodeResult[] }
  | { ok: false; code: GeocodePlaceFailure["code"]; message: string }
> {
  const key = readGoogleMapsApiKey();
  if (!key) {
    return { ok: false, code: "missing_api_key", message: "未設定 GOOGLE_MAPS_API_KEY。" };
  }

  const address = regionBias?.trim() ? `${query}, ${regionBias.trim()}` : query;
  const params = new URLSearchParams({ address, key, language: options.language });
  if (options.countryCode) {
    params.set("components", `country:${options.countryCode}`);
  }
  const url = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Geocoding request failed.";
    return { ok: false, code: "provider_error", message };
  }

  const payload = (await response.json()) as GoogleGeocodeResponse;
  if (!response.ok) {
    return {
      ok: false,
      code: "provider_error",
      message: payload.error_message || `Geocoding HTTP ${response.status}.`,
    };
  }

  if (payload.status === "ZERO_RESULTS") {
    return { ok: false, code: "not_found", message: "找不到符合的地點。" };
  }

  if (payload.status !== "OK" || !payload.results?.length) {
    return {
      ok: false,
      code: "provider_error",
      message: payload.error_message || `Geocoding failed with status ${payload.status}.`,
    };
  }

  const candidates = payload.results
    .map((row) => toGeocodeResult(query, row))
    .filter((row): row is GeocodeResult => Boolean(row))
    .slice(0, 5);

  if (!candidates.length) {
    return { ok: false, code: "not_found", message: "地理編碼結果缺少可用座標。" };
  }

  return { ok: true, candidates };
}

function pickBestCandidate(
  query: string,
  candidates: GeocodeResult[],
  destinationHint?: string | null,
  destinationScope?: TripDestinationScope | null,
): GeocodePlaceResult {
  const scope = destinationScope ?? (destinationHint ? resolveTripDestinationScope(destinationHint) : null);
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(query, candidate, destinationHint || undefined),
      gate: gateForCandidate(query, candidate),
    }))
    .filter((entry) => entry.gate.accepted && candidatePassesDestinationScope(entry.candidate, scope))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    const crossLocale = candidates
      .filter((candidate) => canAcceptCrossLocale(query, candidate, scope))
      .map((candidate) => ({
        candidate,
        score: 0.58,
        gate: gateForCandidate(query, candidate),
      }))
      .sort((a, b) => b.score - a.score);

    if (crossLocale.length) {
      const top = crossLocale[0]!;
      return {
        ok: true,
        place: {
          placeName: query,
          formattedAddress: top.candidate.formattedAddress,
          placeId: top.candidate.placeId ?? null,
          lat: top.candidate.lat,
          lng: top.candidate.lng,
          provider: "google-geocoding",
          confidence: top.score,
          sourceQuery: query,
          countryCode: top.candidate.countryCode ?? null,
        },
      };
    }

    return { ok: false, code: "not_found", message: "沒有通過信心門檻的地理編碼結果。" };
  }

  const top = ranked[0]!;
  const runnerUp = ranked[1];
  if (runnerUp && top.score - runnerUp.score < 0.06 && top.score < 0.82) {
    return { ok: false, code: "ambiguous", message: "找到多個可能地點，無法自動選擇。" };
  }

  const provider: GeocodeProvider = top.candidate.placeId ? "google-geocoding" : "google-geocoding";
  return {
    ok: true,
    place: {
      placeName: query,
      formattedAddress: top.candidate.formattedAddress,
      placeId: top.candidate.placeId ?? null,
      lat: top.candidate.lat,
      lng: top.candidate.lng,
      provider,
      confidence: top.score,
      sourceQuery: query,
      countryCode: top.candidate.countryCode ?? null,
    },
  };
}

function placeSearchHitToGeocodeResult(query: string, hit: PlaceSearchHit): GeocodeResult {
  return {
    query,
    formattedAddress: hit.formattedAddress || hit.name,
    lat: hit.lat,
    lng: hit.lng,
    placeId: hit.placeId.startsWith("noid_") ? undefined : hit.placeId,
    types: hit.types,
  };
}

function pickBestPlaceSearchHit(
  query: string,
  hits: PlaceSearchHit[],
  destinationHint: string | undefined,
  scope: TripDestinationScope | null,
): GeocodePlaceResult | null {
  const candidates = hits.map((hit) => placeSearchHitToGeocodeResult(query, hit));
  const inScope = candidates.filter((candidate) => candidatePassesDestinationScope(candidate, scope));
  if (!inScope.length) {
    return null;
  }

  const ranked = inScope
    .map((candidate) => ({
      candidate,
      score: scoreCandidate(query, candidate, destinationHint),
      gate: gateForCandidate(query, candidate),
    }))
    .sort((a, b) => b.score - a.score);

  let chosen = ranked.find((entry) => entry.gate.accepted);
  if (!chosen) {
    chosen = ranked.find((entry) => canAcceptCrossLocale(query, entry.candidate, scope));
  }
  if (!chosen) {
    const fallback = ranked[0];
    if (!fallback?.candidate.placeId || !scope?.countryCodes.length) {
      return null;
    }
    chosen = { ...fallback, score: 0.55 };
  }

  const top = chosen.candidate;
  return {
    ok: true,
    place: {
      placeName: query,
      formattedAddress: top.formattedAddress,
      placeId: top.placeId ?? null,
      lat: top.lat,
      lng: top.lng,
      provider: "google-places",
      confidence: chosen.score,
      sourceQuery: query,
      countryCode: top.countryCode ?? null,
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
  if (!search.ok || !search.places.length) {
    return null;
  }
  return pickBestPlaceSearchHit(query, search.places, locationHint, scope);
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
  const regionBias = buildRegionBias(input);
  const language = geocodeLanguageForScope(scope);
  const countryCode = primaryCountryCode(scope) || input.countryHint?.trim().toUpperCase();

  const fetched = await fetchGeocodeCandidates(query, regionBias, {
    countryCode,
    language,
  });

  if (fetched.ok) {
    const picked = pickBestCandidate(
      query,
      fetched.candidates,
      input.destinationHint,
      scope,
    );
    if (picked.ok) {
      memoryCache.set(key, picked.place);
      return picked;
    }
  }

  const textSearch = await geocodePlaceViaTextSearch(input, query, scope);
  if (textSearch?.ok) {
    memoryCache.set(key, textSearch.place);
    return textSearch;
  }

  if (!fetched.ok) {
    return { ok: false, code: fetched.code, message: fetched.message };
  }

  return pickBestCandidate(query, fetched.candidates, input.destinationHint, scope);
}

/** Map GeocodedPlace provider to LocationReference.resolvedFrom. */
export function mapGeocodedPlaceResolvedFrom(
  provider: GeocodeProvider,
): "google-geocode" | "google-place-details" {
  return provider === "google-places" ? "google-place-details" : "google-geocode";
}
