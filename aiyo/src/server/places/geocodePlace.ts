import { isUsableMapCoordinate } from "@/lib/geoCoordinates";
import {
  isGeocodeCountryInScope,
  isGeocodePointInScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import {
  evaluateGeocodeConfidenceGate,
  type GeocodeResult,
} from "@/server/geo/geocodeService";
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
  return true;
}

function buildRegionBias(input: GeocodePlaceInput): string | undefined {
  const parts = [input.destinationHint, input.countryHint]
    .map((value) => value?.trim())
    .filter(Boolean) as string[];
  return parts.length ? parts.join(", ") : undefined;
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
  regionBias?: string,
): Promise<
  | { ok: true; candidates: GeocodeResult[] }
  | { ok: false; code: GeocodePlaceFailure["code"]; message: string }
> {
  const key = readGoogleMapsApiKey();
  if (!key) {
    return { ok: false, code: "missing_api_key", message: "未設定 GOOGLE_MAPS_API_KEY。" };
  }

  const address = regionBias?.trim() ? `${query}, ${regionBias.trim()}` : query;
  const params = new URLSearchParams({ address, key });
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
      gate: evaluateGeocodeConfidenceGate({
        rawMention: query,
        cleanedName: query,
        formattedAddress: candidate.formattedAddress,
        types: candidate.types,
        placeId: candidate.placeId,
        baseConfidence: candidate.placeId ? 0.88 : 0.72,
      }),
    }))
    .filter((entry) => entry.gate.accepted && candidatePassesDestinationScope(entry.candidate, scope))
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
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

  const regionBias = buildRegionBias(input);
  const fetched = await fetchGeocodeCandidates(query, regionBias);
  if (!fetched.ok) {
    return { ok: false, code: fetched.code, message: fetched.message };
  }

  const picked = pickBestCandidate(
    query,
    fetched.candidates,
    input.destinationHint,
    resolveScope(input),
  );
  if (picked.ok) {
    memoryCache.set(key, picked.place);
  }
  return picked;
}
