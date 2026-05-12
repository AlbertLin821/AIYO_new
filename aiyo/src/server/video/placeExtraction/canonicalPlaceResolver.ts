const ALIAS_MAP: Record<string, string> = {
  熊本站: "熊本車站",
  熊本駅: "熊本車站",
  JR熊本站: "熊本車站",
  櫻町巴士總站: "熊本櫻町巴士總站",
  熊本桜町バスターミナル: "熊本櫻町巴士總站",
  草千里: "草千里",
  草千里ヶ浜: "草千里ヶ浜",
  黑亭: "黑亭",
  熊本城: "熊本城",
};

function normalizeCore(value: string): string {
  return value
    .trim()
    .replace(/臺/g, "台")
    .replace(/臺灣/g, "台灣")
    .replace(/\s+/g, " ")
    .replace(/[「」『』"“”]/g, "");
}

function normalizedKey(value: string): string {
  return normalizeCore(value).toLowerCase().replace(/\s+/g, "");
}

function normalizeStationVariant(value: string): string {
  const cleaned = normalizeCore(value).replace(/^JR\s*/iu, "").replace(/^JR/iu, "");
  if (/(?:巴士總站|入口站)$/u.test(cleaned)) {
    return cleaned;
  }
  const cjkStation = cleaned.match(/^(.+?)(?:車站|駅|站)$/u);
  if (cjkStation) {
    return `${cjkStation[1]}車站`;
  }
  const englishStation = cleaned.match(/^(.+?)\s+Station$/i);
  if (englishStation) {
    return `${englishStation[1].trim()} Station`;
  }
  return cleaned;
}

export function canonicalizePlaceName(
  input: string,
  _unusedOptions?: {
    destinationHint?: string;
    countryHint?: string;
  },
): {
  canonicalName: string;
  canonicalId?: string;
  matchedAlias?: string;
  aliases: string[];
  confidenceBoost: number;
} {
  void _unusedOptions;
  const normalized = normalizeCore(input);
  const aliasEntry = Object.entries(ALIAS_MAP).find(([alias]) => normalizedKey(alias) === normalizedKey(normalized));
  const stationNormalized = normalizeStationVariant(aliasEntry?.[1] || normalized);
  const canonicalName = aliasEntry?.[1] || stationNormalized;
  const aliases = Array.from(new Set([normalized, stationNormalized, aliasEntry?.[0], canonicalName].filter(Boolean))) as string[];
  return {
    canonicalName,
    canonicalId: normalizedKey(canonicalName),
    matchedAlias: aliasEntry?.[0],
    aliases,
    confidenceBoost: aliasEntry ? 0.18 : stationNormalized !== normalized ? 0.12 : 0,
  };
}
