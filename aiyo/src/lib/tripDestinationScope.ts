import catalog from "../../data/planning-destination-catalog.json";

export type TripDestinationScopeSource = "catalog" | "geocode" | "unknown";

export type TripDestinationScope = {
  canonicalLabel: string;
  countryCodes: string[];
  positiveTokens: string[];
  negativeRegionTokens: string[];
  isCountryLevel: boolean;
  center?: { lat: number; lng: number };
  radiusKm?: number;
  source: TripDestinationScopeSource;
};

type CatalogEntry = {
  canonical: string;
  aliases: string[];
  countryCode?: string;
  isCountryLevel?: boolean;
};

type ScopeCatalog = {
  entries: CatalogEntry[];
};

const COUNTRY_POSITIVE_ALIASES: Record<string, string[]> = {
  JP: ["日本", "japan", "nippon", "にほん", "nihon"],
  TW: ["台灣", "臺灣", "taiwan", "formosa"],
  KR: ["韓國", "韩国", "korea", "south korea", "대한민국"],
  US: ["美國", "美国", "usa", "united states", "america"],
  TH: ["泰國", "泰国", "thailand"],
  FR: ["法國", "法国", "france"],
  GB: ["英國", "英国", "united kingdom", "uk", "england"],
  ES: ["西班牙", "spain", "españa"],
  IT: ["義大利", "意大利", "italy", "italia"],
  AU: ["澳洲", "澳大利亚", "australia"],
  NZ: [
    "紐西蘭",
    "新西蘭",
    "new zealand",
    "aotearoa",
    "queenstown",
    "皇后鎮",
    "christchurch",
    "基督城",
    "wanaka",
    "te anau",
    "milford",
    "但尼丁",
    "dunedin",
    "rotorua",
    "奧克蘭",
    "auckland",
  ],
  ID: ["印尼", "印度尼西亚", "indonesia", "bali", "峇里島"],
  VN: ["越南", "vietnam", "việt nam"],
  HK: ["香港", "hong kong"],
  MO: ["澳門", "澳门", "macau", "macao"],
  SG: ["新加坡", "singapore"],
  MY: ["馬來西亞", "马来西亚", "malaysia"],
  AE: ["杜拜", "迪拜", "dubai", "uae"],
};

const NEGATIVE_REGION_BY_COUNTRY: Record<string, string[]> = {
  JP: [
    "new york",
    "los angeles",
    "san francisco",
    "las vegas",
    "chicago",
    "miami",
    "usa",
    "united states",
    "america",
    "美國",
    "纽约",
    "紐約",
    "洛杉磯",
    "舊金山",
    "倫敦",
    "london",
    "paris",
    "巴黎",
    "首爾",
    "seoul",
    "曼谷",
    "bangkok",
    "台北",
    "taipei",
    "台灣",
    "臺灣",
    "taiwan",
    "formosa",
    "桃園",
    "taoyuan",
    "高雄",
    "kaohsiung",
    "台中",
    "taichung",
  ],
  TW: [
    "tokyo",
    "東京",
    "osaka",
    "大阪",
    "japan",
    "日本",
    "seoul",
    "首爾",
    "new york",
    "美國",
    "usa",
  ],
  NZ: [
    "taipei",
    "台北",
    "臺北",
    "台灣",
    "臺灣",
    "taiwan",
    "tokyo",
    "東京",
    "japan",
    "日本",
  ],
  KR: [
    "tokyo",
    "東京",
    "japan",
    "日本",
    "taipei",
    "台北",
    "new york",
    "美國",
  ],
  US: [
    "東京",
    "tokyo",
    "大阪",
    "osaka",
    "京都",
    "kyoto",
    "japan",
    "日本",
    "首爾",
    "seoul",
    "台北",
    "taipei",
    "曼谷",
    "bangkok",
  ],
};

const DEFAULT_RADIUS_KM = 650;

let aliasIndex: Array<{
  alias: string;
  canonical: string;
  countryCode?: string;
  isCountryLevel?: boolean;
}> | null = null;

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildAliasIndex(): typeof aliasIndex {
  const rows: NonNullable<typeof aliasIndex> = [];
  const data = catalog as ScopeCatalog;
  for (const entry of data.entries) {
    for (const alias of entry.aliases) {
      const trimmed = alias.trim();
      if (trimmed.length < 2) {
        continue;
      }
      rows.push({
        alias: trimmed,
        canonical: entry.canonical,
        countryCode: entry.countryCode,
        isCountryLevel: entry.isCountryLevel,
      });
    }
  }
  rows.sort((a, b) => b.alias.length - a.alias.length);
  return rows;
}

function getAliasIndex(): Array<{
  alias: string;
  canonical: string;
  countryCode?: string;
  isCountryLevel?: boolean;
}> {
  if (!aliasIndex) {
    aliasIndex = buildAliasIndex();
  }
  return aliasIndex!;
}

function findCatalogEntry(destination: string): CatalogEntry | undefined {
  const normalized = destination.trim();
  if (!normalized) {
    return undefined;
  }
  const lower = normalizeToken(normalized);
  for (const row of getAliasIndex()) {
    if (row.alias === normalized || normalizeToken(row.alias) === lower) {
      const data = catalog as ScopeCatalog;
      return data.entries.find((entry) => entry.canonical === row.canonical);
    }
  }
  for (const row of getAliasIndex()) {
    if (normalized.includes(row.alias) || lower.includes(normalizeToken(row.alias))) {
      const data = catalog as ScopeCatalog;
      return data.entries.find((entry) => entry.canonical === row.canonical);
    }
  }
  return undefined;
}

function uniqueTokens(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const token of tokens) {
    const trimmed = token.trim();
    if (trimmed.length < 2) {
      continue;
    }
    const key = normalizeToken(trimmed);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

function haystackIncludesToken(haystack: string, token: string): boolean {
  const lowerHay = normalizeToken(haystack);
  const t = token.trim();
  if (t.length < 2) {
    return false;
  }
  const nt = normalizeToken(t);
  if (lowerHay.includes(nt) || haystack.includes(t)) {
    return true;
  }
  return false;
}

export function buildTripDestinationScopeFromCatalog(destination: string): TripDestinationScope | null {
  const trimmed = destination.trim();
  if (!trimmed) {
    return null;
  }

  const entry = findCatalogEntry(trimmed);
  if (!entry) {
    return null;
  }

  const countryCodes = entry.countryCode ? [entry.countryCode] : [];
  const sameCountryAliases = entry.isCountryLevel && entry.countryCode
    ? (catalog as ScopeCatalog).entries
        .filter((row) => row.countryCode === entry.countryCode && !row.isCountryLevel)
        .flatMap((row) => [row.canonical, ...row.aliases])
    : [];
  const positiveTokens = uniqueTokens([
    entry.canonical,
    ...entry.aliases,
    ...sameCountryAliases,
    ...(entry.countryCode ? COUNTRY_POSITIVE_ALIASES[entry.countryCode] || [] : []),
  ]);
  const negativeRegionTokens =
    entry.countryCode && NEGATIVE_REGION_BY_COUNTRY[entry.countryCode]
      ? [...NEGATIVE_REGION_BY_COUNTRY[entry.countryCode]]
      : [];

  return {
    canonicalLabel: entry.canonical,
    countryCodes,
    positiveTokens,
    negativeRegionTokens,
    isCountryLevel: Boolean(entry.isCountryLevel),
    source: "catalog",
  };
}

function buildCountryAliasScope(destination: string): TripDestinationScope | null {
  const normalized = normalizeToken(destination);
  for (const [countryCode, aliases] of Object.entries(COUNTRY_POSITIVE_ALIASES)) {
    const matched = aliases.find((alias) => {
      const normalizedAlias = normalizeToken(alias);
      return normalized === normalizedAlias || normalized.includes(normalizedAlias);
    });
    if (!matched) {
      continue;
    }
    return {
      canonicalLabel: matched,
      countryCodes: [countryCode],
      positiveTokens: uniqueTokens(aliases),
      negativeRegionTokens: NEGATIVE_REGION_BY_COUNTRY[countryCode] || [],
      isCountryLevel: true,
      source: "catalog",
    };
  }
  return null;
}

export function resolveTripDestinationScope(destination?: string | null): TripDestinationScope | null {
  const trimmed = destination?.trim();
  if (!trimmed) {
    return null;
  }
  return buildTripDestinationScopeFromCatalog(trimmed) || buildCountryAliasScope(trimmed);
}

export function mergeTripDestinationScope(
  base: TripDestinationScope | null | undefined,
  patch: Partial<TripDestinationScope> & { source?: TripDestinationScopeSource },
): TripDestinationScope {
  const seed =
    base ??
    ({
      canonicalLabel: patch.canonicalLabel || "",
      countryCodes: [],
      positiveTokens: [],
      negativeRegionTokens: [],
      isCountryLevel: false,
      source: "unknown",
    } satisfies TripDestinationScope);

  return {
    canonicalLabel: patch.canonicalLabel?.trim() || seed.canonicalLabel,
    countryCodes: uniqueCountryCodes(patch.countryCodes ?? seed.countryCodes),
    positiveTokens: uniqueTokens([...seed.positiveTokens, ...(patch.positiveTokens || [])]),
    negativeRegionTokens: uniqueTokens([
      ...seed.negativeRegionTokens,
      ...(patch.negativeRegionTokens || []),
    ]),
    isCountryLevel: patch.isCountryLevel ?? seed.isCountryLevel,
    center: patch.center ?? seed.center,
    radiusKm: patch.radiusKm ?? seed.radiusKm,
    source: patch.source ?? seed.source,
  };
}

function uniqueCountryCodes(codes: string[]): string[] {
  return [...new Set(codes.map((c) => c.trim().toUpperCase()).filter(Boolean))];
}

export function isTextInTripDestinationScope(
  text: string,
  scope: TripDestinationScope | null | undefined,
  options?: { strictCountryLevel?: boolean },
): boolean {
  if (!scope?.countryCodes.length && !scope?.positiveTokens.length) {
    return true;
  }

  const haystack = `${text}`;
  const hasPositive = scope.positiveTokens.some((token) => haystackIncludesToken(haystack, token));
  const hasNegative = scope.negativeRegionTokens.some((token) =>
    haystackIncludesToken(haystack, token),
  );

  if (hasNegative && !hasPositive) {
    return false;
  }

  const strict = options?.strictCountryLevel ?? scope.isCountryLevel;
  if (strict && scope.countryCodes.length > 0 && !hasPositive) {
    return false;
  }

  return true;
}

export function isGeocodeCountryInScope(
  countryCode: string | null | undefined,
  scope: TripDestinationScope | null | undefined,
): boolean {
  if (!scope?.countryCodes.length) {
    return true;
  }
  if (!countryCode?.trim()) {
    return true;
  }
  return scope.countryCodes.includes(countryCode.trim().toUpperCase());
}

export function isGeocodePointInScope(
  lat: number,
  lng: number,
  scope: TripDestinationScope | null | undefined,
): boolean {
  if (!scope?.center || !scope.radiusKm) {
    return true;
  }
  const distanceKm = haversineKm(scope.center.lat, scope.center.lng, lat, lng);
  return distanceKm <= scope.radiusKm;
}

type CountryCoordBounds = {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
};

const COUNTRY_COORD_BOUNDS: Record<string, CountryCoordBounds> = {
  TW: { latMin: 21.85, latMax: 25.55, lngMin: 118.0, lngMax: 122.05 },
  JP: { latMin: 24.0, latMax: 46.5, lngMin: 122.0, lngMax: 154.5 },
  KR: { latMin: 33.0, latMax: 39.5, lngMin: 124.5, lngMax: 132.5 },
  NZ: { latMin: -47.5, latMax: -34.0, lngMin: 166.0, lngMax: 179.0 },
};

const VIDEO_METADATA_DESTINATION_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: "New Zealand",
    pattern:
      /(紐西蘭|新西蘭|new\s*zealand|aotearoa|queenstown|皇后鎮|christchurch|基督城|te\s*anau|wanaka|milford|但尼丁|dunedin|rotorua|奧克蘭|auckland|庫克山|库克山|瓦卡蒂普|格林諾奇|fergburger)/i,
  },
  {
    label: "Japan",
    pattern:
      /(日本|japan|nippon|北海道|東京|大阪|京都|札幌|小樽|函館|沖繩|福岡|奈良|廣島|sapporo|osaka|kyoto|tokyo|hokkaido|okinawa)/i,
  },
  {
    label: "Korea",
    pattern: /(韓國|韩国|korea|seoul|首爾|首尔|busan|釜山|jeju|濟州)/i,
  },
  {
    label: "Thailand",
    pattern: /(泰國|泰国|thailand|bangkok|曼谷|chiang\s*mai|清邁|phuket|普吉)/i,
  },
  {
    label: "Taiwan",
    pattern: /(台灣|臺灣|taiwan|formosa)/i,
  },
];

/** Infer primary destination country/region from video title + description (not user trip). */
export function inferTripDestinationLabelFromVideoMetadata(input: {
  title?: string;
  description?: string;
}): string | null {
  const haystack = [input.title, input.description].filter(Boolean).join("\n");
  if (!haystack.trim()) {
    return null;
  }
  for (const rule of VIDEO_METADATA_DESTINATION_RULES) {
    if (rule.pattern.test(haystack)) {
      return rule.label;
    }
  }
  return null;
}

function pointInCountryBounds(lat: number, lng: number, bounds: CountryCoordBounds): boolean {
  return lat >= bounds.latMin && lat <= bounds.latMax && lng >= bounds.lngMin && lng <= bounds.lngMax;
}

/** Rough country guess from coordinates when Geocoding API omits countryCode (e.g. Places text search). */
export function inferCountryCodeFromCoordinates(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  const hits = Object.entries(COUNTRY_COORD_BOUNDS)
    .filter(([, bounds]) => pointInCountryBounds(lat, lng, bounds))
    .map(([code]) => code);
  if (hits.length === 1) {
    return hits[0] ?? null;
  }
  if (hits.includes("TW") && hits.includes("JP")) {
    return lng <= 122.05 ? "TW" : "JP";
  }
  return hits[0] ?? null;
}

export function coordinatesMatchDestinationCountryScope(
  lat: number,
  lng: number,
  scope: TripDestinationScope | null | undefined,
): boolean {
  if (!scope?.countryCodes.length) {
    return true;
  }
  const inferred = inferCountryCodeFromCoordinates(lat, lng);
  if (!inferred) {
    return true;
  }
  return scope.countryCodes.includes(inferred);
}

const EXPLICIT_DEPARTURE_TOKENS_BY_COUNTRY: Record<string, string[]> = {
  TW: [
    "桃園",
    "taoyuan",
    "松山機場",
    "songshan airport",
    "高雄",
    "kaohsiung",
    "台中",
    "taichung",
    "台北",
    "臺北",
    "taipei",
    "台灣",
    "臺灣",
    "taiwan",
    "formosa",
    "出境",
    "返台",
    "回台",
  ],
};

/** True when place name/address clearly indicates a departure or foreign stop (e.g. 桃園機場 on a Japan video). */
export function isExplicitDepartureOrForeignPlace(
  placeText: string,
  inferredCountry: string | null | undefined,
): boolean {
  const country = inferredCountry?.trim().toUpperCase();
  if (!country) {
    return false;
  }
  const tokens = EXPLICIT_DEPARTURE_TOKENS_BY_COUNTRY[country];
  if (!tokens?.length) {
    return false;
  }
  const haystack = placeText.trim();
  if (!haystack) {
    return false;
  }
  return tokens.some((token) => haystackIncludesToken(haystack, token));
}

export function geocodeResultFailsDestinationScope(
  result: {
    countryCode?: string | null;
    lat: number;
    lng: number;
    formattedAddress?: string | null;
    placeName?: string | null;
  },
  scope: TripDestinationScope | null | undefined,
): string | null {
  if (!scope?.countryCodes.length) {
    return null;
  }
  const placeHaystack = [result.placeName, result.formattedAddress].filter(Boolean).join(" ");
  const departureHaystack = result.placeName?.trim() || placeHaystack;
  const effectiveCountry =
    result.countryCode?.trim().toUpperCase() ||
    inferCountryCodeFromCoordinates(result.lat, result.lng) ||
    null;
  if (effectiveCountry && !isGeocodeCountryInScope(effectiveCountry, scope)) {
    if (isExplicitDepartureOrForeignPlace(departureHaystack, effectiveCountry)) {
      return null;
    }
    if (
      placeHaystack &&
      isTextInTripDestinationScope(placeHaystack, scope, { strictCountryLevel: true })
    ) {
      return `Geocoded country (${effectiveCountry}) conflicts with place name for video scope.`;
    }
    return `Geocoded country (${effectiveCountry}) is outside trip destination scope.`;
  }
  if (!effectiveCountry && result.formattedAddress?.trim()) {
    if (
      !isTextInTripDestinationScope(result.formattedAddress, scope, { strictCountryLevel: true })
    ) {
      return "Geocoded address is outside trip destination scope.";
    }
  }
  if (!isGeocodePointInScope(result.lat, result.lng, scope)) {
    return "Geocoded coordinates are outside trip destination radius.";
  }
  if (scope.countryCodes.includes("TW") && effectiveCountry === "TW") {
    const placeName = result.placeName?.trim() || "";
    if (
      placeName &&
      !isTextInTripDestinationScope(placeName, scope, { strictCountryLevel: true }) &&
      !isExplicitDepartureOrForeignPlace(placeName, "TW")
    ) {
      return "Place name is outside Taiwan video scope.";
    }
    const compactAddress = (result.formattedAddress || "").replace(/\s/g, "");
    if (/^(台灣|臺灣|台湾){2}$/i.test(compactAddress) || /^taiwan$/i.test(compactAddress)) {
      return "Geocoded address is too vague for Taiwan place.";
    }
  }
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function scopeFromGeocodeResult(input: {
  query: string;
  countryCode?: string | null;
  lat: number;
  lng: number;
  formattedAddress?: string | null;
}): TripDestinationScope | null {
  const country = input.countryCode?.trim().toUpperCase();
  if (!country) {
    return null;
  }

  const positiveTokens = uniqueTokens([
    input.query,
    input.formattedAddress || "",
    ...(COUNTRY_POSITIVE_ALIASES[country] || []),
  ]);

  return {
    canonicalLabel: input.query.trim(),
    countryCodes: [country],
    positiveTokens,
    negativeRegionTokens: NEGATIVE_REGION_BY_COUNTRY[country] || [],
    isCountryLevel: false,
    center: { lat: input.lat, lng: input.lng },
    radiusKm: DEFAULT_RADIUS_KM,
    source: "geocode",
  };
}

/** For tests — reset cached alias index after catalog reload. */
export function clearTripDestinationScopeCacheForTests() {
  aliasIndex = null;
}

export function enrichChatContextWithDestinationScope<T extends { destination?: string; destinationScope?: TripDestinationScope }>(
  context?: T,
): T | undefined {
  if (!context) {
    return context;
  }
  if (context.destinationScope?.countryCodes?.length) {
    return context;
  }
  const destination = context.destination?.trim();
  if (!destination) {
    return context;
  }
  const scope = resolveTripDestinationScope(destination);
  if (!scope) {
    return context;
  }
  return { ...context, destinationScope: scope };
}
