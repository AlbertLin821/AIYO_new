import type { LocationReference } from "@/types";

const KNOWN_LOCATIONS: Record<string, LocationReference> = {
  "tokyo tower": {
    name: "Tokyo Tower",
    lat: 35.6586,
    lng: 139.7454,
    description: "Iconic city observation landmark.",
    address: "4 Chome-2-8 Shibakoen, Minato City, Tokyo",
  },
  shibuya: {
    name: "Shibuya",
    lat: 35.6595,
    lng: 139.7005,
    description: "Major shopping and nightlife hub.",
    address: "Shibuya City, Tokyo",
  },
  asakusa: {
    name: "Asakusa",
    lat: 35.7147,
    lng: 139.7967,
    description: "Historic district centered around Senso-ji.",
    address: "Asakusa, Taito City, Tokyo",
  },
  "senso-ji": {
    name: "Senso-ji",
    lat: 35.7148,
    lng: 139.7967,
    description: "Historic temple district and easy morning start.",
    address: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
  },
  "tokyo skytree": {
    name: "Tokyo Skytree",
    lat: 35.7101,
    lng: 139.8107,
    description: "Observation tower and shopping complex.",
    address: "1 Chome-1-2 Oshiage, Sumida City, Tokyo",
  },
  ginza: {
    name: "Ginza",
    lat: 35.6717,
    lng: 139.765,
    description: "Shopping district that transitions well into dinner.",
    address: "Ginza, Chuo City, Tokyo",
  },
  odaiba: {
    name: "Odaiba",
    lat: 35.6266,
    lng: 139.7765,
    description: "Waterfront zone suited for a final evening stop.",
    address: "Daiba, Minato City, Tokyo",
  },
  tsukiji: {
    name: "Tsukiji Outer Market",
    lat: 35.6655,
    lng: 139.7708,
    description: "Food-heavy district for seafood and small bites.",
    address: "4 Chome-16-2 Tsukiji, Chuo City, Tokyo",
  },
  shinjuku: {
    name: "Shinjuku",
    lat: 35.6938,
    lng: 139.7034,
    description: "Transit-heavy district with shopping and nightlife.",
    address: "Shinjuku City, Tokyo",
  },
  omotesando: {
    name: "Omotesando",
    lat: 35.6653,
    lng: 139.7122,
    description: "Design-forward shopping and coffee area.",
    address: "Jingumae, Shibuya City, Tokyo",
  },
  daikanyama: {
    name: "Daikanyama",
    lat: 35.6482,
    lng: 139.7031,
    description: "Relaxed neighborhood with bookstores and cafes.",
    address: "Daikanyamacho, Shibuya City, Tokyo",
  },
  dotonbori: {
    name: "Dotonbori",
    lat: 34.6687,
    lng: 135.5019,
    description: "Dense food and nightlife strip.",
    address: "Dotonbori, Chuo Ward, Osaka",
  },
  "osaka castle": {
    name: "Osaka Castle",
    lat: 34.6873,
    lng: 135.5262,
    description: "Historic site and broad park grounds.",
    address: "1-1 Osakajo, Chuo Ward, Osaka",
  },
  shinsekai: {
    name: "Shinsekai",
    lat: 34.6525,
    lng: 135.5063,
    description: "Retro food district with casual local energy.",
    address: "Ebisuhigashi, Naniwa Ward, Osaka",
  },
};

const TAIWAN_FALLBACK_ANCHORS: LocationReference[] = [
  {
    name: "臺北",
    lat: 25.033,
    lng: 121.5654,
    description: "臺灣北部常用參考點。",
    address: "臺北市",
  },
  {
    name: "臺中",
    lat: 24.1477,
    lng: 120.6736,
    description: "臺灣中部常用參考點。",
    address: "臺中市",
  },
  {
    name: "高雄",
    lat: 22.6273,
    lng: 120.3014,
    description: "臺灣南部常用參考點。",
    address: "高雄市",
  },
];

const CHIAYI_ANCHORS: LocationReference[] = [
  {
    name: "嘉義市區",
    lat: 23.4801,
    lng: 120.4491,
    description: "嘉義市區參考座標。",
    address: "嘉義市",
  },
  {
    name: "阿里山",
    lat: 23.5167,
    lng: 120.8014,
    description: "嘉義縣山區景點常見參考。",
    address: "嘉義縣阿里山鄉",
  },
];

const DESTINATION_ANCHORS: Record<string, LocationReference[]> = {
  taiwan: TAIWAN_FALLBACK_ANCHORS,
  台灣: TAIWAN_FALLBACK_ANCHORS,
  臺灣: TAIWAN_FALLBACK_ANCHORS,
  嘉義: CHIAYI_ANCHORS,
  chiayi: CHIAYI_ANCHORS,
  tokyo: [
    KNOWN_LOCATIONS["tokyo tower"],
    KNOWN_LOCATIONS.shibuya,
    KNOWN_LOCATIONS.asakusa,
    KNOWN_LOCATIONS.odaiba,
  ],
  東京: [
    KNOWN_LOCATIONS["tokyo tower"],
    KNOWN_LOCATIONS.shibuya,
    KNOWN_LOCATIONS.asakusa,
    KNOWN_LOCATIONS.odaiba,
  ],
  osaka: [
    KNOWN_LOCATIONS.dotonbori,
    KNOWN_LOCATIONS["osaka castle"],
    KNOWN_LOCATIONS.shinsekai,
  ],
  大阪: [
    KNOWN_LOCATIONS.dotonbori,
    KNOWN_LOCATIONS["osaka castle"],
    KNOWN_LOCATIONS.shinsekai,
  ],
};

function normalizeName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function inferAnchorList(destinationHint?: string): LocationReference[] {
  const key = normalizeName(destinationHint || "taiwan");
  const direct = DESTINATION_ANCHORS[key];
  if (direct) {
    return direct;
  }
  const hint = destinationHint || "";
  if (/嘉義/i.test(hint)) {
    return CHIAYI_ANCHORS;
  }
  if (/東京|tokyo/i.test(hint)) {
    return DESTINATION_ANCHORS.tokyo;
  }
  if (/大阪|osaka/i.test(hint)) {
    return DESTINATION_ANCHORS.osaka;
  }
  return TAIWAN_FALLBACK_ANCHORS;
}

export function resolveLocationReference(
  name: string,
  destinationHint?: string,
  description?: string,
): LocationReference {
  const normalized = normalizeName(name);
  const directMatch = KNOWN_LOCATIONS[normalized];
  if (directMatch) {
    return {
      ...directMatch,
      description: description || directMatch.description,
    };
  }

  const partialMatch = Object.entries(KNOWN_LOCATIONS).find(([key]) =>
    normalized.includes(key) || key.includes(normalized),
  )?.[1];
  if (partialMatch) {
    return {
      ...partialMatch,
      name,
      description: description || partialMatch.description,
    };
  }

  const anchors = inferAnchorList(destinationHint);
  const fallback = anchors[Math.abs(normalized.length) % anchors.length];

  return {
    name,
    lat: fallback.lat + (normalized.length % 3) * 0.005,
    lng: fallback.lng + (normalized.length % 4) * 0.005,
    description: description || `Location inferred near ${destinationHint || fallback.name}.`,
    address: destinationHint || fallback.address,
  };
}

export function findKnownLocationReference(
  name: string,
  description?: string,
): LocationReference | null {
  const normalized = normalizeName(name);
  const directMatch = KNOWN_LOCATIONS[normalized];
  if (directMatch) {
    return {
      ...directMatch,
      description: description || directMatch.description,
    };
  }

  const partialMatch = Object.entries(KNOWN_LOCATIONS).find(([key]) =>
    normalized.includes(key) || key.includes(normalized),
  )?.[1];
  if (!partialMatch) {
    return null;
  }

  return {
    ...partialMatch,
    name,
    description: description || partialMatch.description,
  };
}

export function resolveLocationNames(
  names: string[],
  destinationHint?: string,
): LocationReference[] {
  const seen = new Set<string>();
  return names
    .map((name) => name.trim())
    .filter((name) => name.length > 1)
    .filter((name) => {
      const key = normalizeName(name);
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .map((name) => resolveLocationReference(name, destinationHint));
}
