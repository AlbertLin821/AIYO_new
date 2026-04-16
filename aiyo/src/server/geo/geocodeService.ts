import { serverConfig } from "@/server/config";
import {
  mergeAndDedupeExtractions,
  type PlaceCandidate,
  type PlaceNameExtraction,
} from "@/server/geo/extractLocations";
import { resolveLocationReference } from "@/server/geo/locationCatalog";
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

/** 依使用者目的地粗判預期國碼（僅在明顯可判時）。 */
function expectedCountryFromDestination(hint?: string): string | null {
  if (!hint?.trim()) {
    return null;
  }
  const n = normalizeToken(hint);
  const japanHints = [
    "tokyo",
    "osaka",
    "kyoto",
    "japan",
    "日本",
    "東京",
    "大阪",
    "京都",
    "沖繩",
    "okinawa",
    "hokkaido",
    "北海道",
    "福岡",
    "fukuoka",
    "名古屋",
    "nagoya",
    "廣島",
    "hiroshima",
  ];
  if (japanHints.some((h) => n.includes(h))) {
    return "JP";
  }
  const korea = ["seoul", "korea", "首爾", "韓國", "韩国", "busan", "釜山"];
  if (korea.some((h) => n.includes(h))) {
    return "KR";
  }
  const taiwan = ["taiwan", "台灣", "臺灣", "台北", "高雄", "台中"];
  if (taiwan.some((h) => n.includes(h))) {
    return "TW";
  }
  return null;
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

export async function geocodeWithGoogle(
  rawQuery: string,
  regionBias?: string,
): Promise<
  | { ok: true; result: GeocodeResult }
  | { ok: false; reason: string; googleStatus?: string }
> {
  const key = serverConfig.googleMapsApiKey;
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
  if (!loc || !Number.isFinite(loc.lat) || !Number.isFinite(loc.lng)) {
    return { ok: false, reason: "Geocoding response missing coordinates.", googleStatus: status };
  }

  const types = first.types || [];
  const countryCode = extractCountryCode(first.address_components);

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
  options: { destinationHint?: string; transcriptContext?: string },
): Promise<{
  locations: LocationReference[];
  failures: string[];
  mapsProvenance: "google-geocoding" | "catalog-fallback" | "mixed";
}> {
  const destinationHint = options.destinationHint;
  const expectedCountry = expectedCountryFromDestination(destinationHint);
  const locations: LocationReference[] = [];
  const failures: string[] = [];
  let googleCount = 0;
  let catalogCount = 0;

  if (!serverConfig.googleMapsApiKey) {
    for (const cand of candidates) {
      const extraction = cand.extraction;
      const fallback = resolveLocationReference(
        extraction.displayName,
        destinationHint,
        `內部地名對照（未設定 Google Maps API 金鑰）。`,
      );
      const conf = Math.min(1, cand.rerankScore / 10) * 0.35;
      locations.push({
        ...fallback,
        resolvedFrom: cand.source,
        rawQuery: extraction.raw,
        raw: extraction.raw,
        normalized: extraction.normalized,
        normalizedName: extraction.displayName,
        name: extraction.displayName,
        confidence: conf,
        verified: false,
        description: `${fallback.description}（信心：低，未經 Google 驗證）`,
      });
      catalogCount += 1;
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
      const countryMatch =
        !expectedCountry ||
        !result.countryCode ||
        result.countryCode === expectedCountry;
      const addressMatch = formattedAddressMentionsCandidate(
        result.formattedAddress,
        extraction.displayName,
      );

      let confidence = combineConfidence({
        rerankScore: cand.rerankScore,
        typeScore,
        countryMatch,
        addressMatch,
      });

      if (!countryMatch && cand.source === "heuristic") {
        confidence *= 0.35;
      }

      const verified =
        confidence >= 0.52 &&
        countryMatch &&
        typeScore >= 0.25 &&
        !(result.types.length <= 1 && result.types.includes("country"));

      if (confidence < DROP_CONFIDENCE_BELOW) {
        failures.push(
          `${extraction.displayName}：信心過低（${confidence.toFixed(2)}），已略過。`,
        );
        continue;
      }

      googleCount += 1;
      locations.push({
        name: extraction.displayName,
        lat: result.lat,
        lng: result.lng,
        description: verified
          ? `已通過 Google 地理編碼驗證（${result.formattedAddress}）`
          : `Google 地理編碼結果，信心偏低（${result.formattedAddress}）`,
        address: result.formattedAddress,
        resolvedFrom: "google-geocode",
        rawQuery: extraction.raw,
        raw: extraction.raw,
        normalized: extraction.normalized,
        normalizedName: extraction.displayName,
        confidence,
        verified,
      });
      continue;
    }

    failures.push(`${extraction.displayName}：${resolved.reason}`);
    catalogCount += 1;
    const fallback = resolveLocationReference(
      extraction.displayName,
      destinationHint,
      `Google 查無或失敗，改為內部地名對照。`,
    );
    const conf = Math.min(1, cand.rerankScore / 10) * 0.32;
    locations.push({
      ...fallback,
      resolvedFrom: cand.source,
      rawQuery: extraction.raw,
      raw: extraction.raw,
      normalized: extraction.normalized,
      normalizedName: extraction.displayName,
      name: extraction.displayName,
      confidence: conf,
      verified: false,
      description: `${fallback.description}（未通過線上地理編碼，信心：低）`,
    });
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
