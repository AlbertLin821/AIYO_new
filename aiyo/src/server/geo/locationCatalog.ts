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
  "kumamoto station": {
    name: "熊本車站",
    lat: 32.7898,
    lng: 130.6895,
    description: "Kumamoto main rail hub.",
    address: "3 Chome-15 Kasuga, Nishi Ward, Kumamoto",
  },
  熊本車站: {
    name: "熊本車站",
    lat: 32.7898,
    lng: 130.6895,
    description: "Kumamoto main rail hub.",
    address: "3 Chome-15 Kasuga, Nishi Ward, Kumamoto",
  },
  "kumamoto castle": {
    name: "熊本城",
    lat: 32.8063,
    lng: 130.7058,
    description: "Major Kumamoto landmark.",
    address: "1-1 Honmaru, Chuo Ward, Kumamoto",
  },
  熊本城: {
    name: "熊本城",
    lat: 32.8063,
    lng: 130.7058,
    description: "Major Kumamoto landmark.",
    address: "1-1 Honmaru, Chuo Ward, Kumamoto",
  },
  "kumamoto sakuramachi bus terminal": {
    name: "熊本櫻町巴士總站",
    lat: 32.801,
    lng: 130.7074,
    description: "Central intercity bus terminal in Kumamoto.",
    address: "3-10 Sakuramachi, Chuo Ward, Kumamoto",
  },
  熊本櫻町巴士總站: {
    name: "熊本櫻町巴士總站",
    lat: 32.801,
    lng: 130.7074,
    description: "Central intercity bus terminal in Kumamoto.",
    address: "3-10 Sakuramachi, Chuo Ward, Kumamoto",
  },
  kusasenri: {
    name: "草千里",
    lat: 32.8849,
    lng: 131.0807,
    description: "Aso grassland viewpoint.",
    address: "Kusasenri, Aso, Kumamoto",
  },
  草千里: {
    name: "草千里",
    lat: 32.8849,
    lng: 131.0807,
    description: "Aso grassland viewpoint.",
    address: "Kusasenri, Aso, Kumamoto",
  },
  kokutei: {
    name: "黑亭",
    lat: 32.7984,
    lng: 130.7007,
    description: "Well-known ramen shop in Kumamoto.",
    address: "2 Chome-1-23 Futaba, Nishi Ward, Kumamoto",
  },
  黑亭: {
    name: "黑亭",
    lat: 32.7984,
    lng: 130.7007,
    description: "Well-known ramen shop in Kumamoto.",
    address: "2 Chome-1-23 Futaba, Nishi Ward, Kumamoto",
  },
  "chiayi wenhua road night market": {
    name: "嘉義文化路夜市",
    lat: 23.4808,
    lng: 120.4497,
    description: "Night market in central Chiayi.",
    address: "Wenhua Road, West District, Chiayi City",
  },
  嘉義文化路夜市: {
    name: "嘉義文化路夜市",
    lat: 23.4808,
    lng: 120.4497,
    description: "Night market in central Chiayi.",
    address: "Wenhua Road, West District, Chiayi City",
  },
  "guo jia turkey rice": {
    name: "郭家火雞肉飯",
    lat: 23.4799,
    lng: 120.4468,
    description: "Named turkey rice shop in Chiayi.",
    address: "Chiayi City",
  },
  郭家火雞肉飯: {
    name: "郭家火雞肉飯",
    lat: 23.4799,
    lng: 120.4468,
    description: "Named turkey rice shop in Chiayi.",
    address: "Chiayi City",
  },
  "shibuya station": {
    name: "Shibuya Station",
    lat: 35.658,
    lng: 139.7016,
    description: "Major Tokyo rail hub.",
    address: "2 Chome Dogenzaka, Shibuya City, Tokyo",
  },
  "shibuya crossing": {
    name: "Shibuya Crossing",
    lat: 35.6595,
    lng: 139.7005,
    description: "Famous crossing in central Shibuya.",
    address: "2 Chome-2-1 Dogenzaka, Shibuya City, Tokyo",
  },
  "hongik university station": {
    name: "弘大入口站",
    lat: 37.5572,
    lng: 126.9245,
    description: "Transit station for Hongdae area.",
    address: "Yanghwa-ro, Mapo-gu, Seoul",
  },
  弘大入口站: {
    name: "弘大入口站",
    lat: 37.5572,
    lng: 126.9245,
    description: "Transit station for Hongdae area.",
    address: "Yanghwa-ro, Mapo-gu, Seoul",
  },
  hongdae: {
    name: "弘大商圈",
    lat: 37.5563,
    lng: 126.922,
    description: "Hongdae shopping and nightlife district.",
    address: "Hongdae, Mapo-gu, Seoul",
  },
  弘大商圈: {
    name: "弘大商圈",
    lat: 37.5563,
    lng: 126.922,
    description: "Hongdae shopping and nightlife district.",
    address: "Hongdae, Mapo-gu, Seoul",
  },
  myeongdong: {
    name: "明洞",
    lat: 37.5636,
    lng: 126.9834,
    description: "Myeongdong shopping district.",
    address: "Myeong-dong, Jung-gu, Seoul",
  },
  明洞: {
    name: "明洞",
    lat: 37.5636,
    lng: 126.9834,
    description: "Myeongdong shopping district.",
    address: "Myeong-dong, Jung-gu, Seoul",
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
  const hint = destinationHint || "";
  const key = normalizeName(hint || "taiwan");
  const direct = DESTINATION_ANCHORS[key];
  if (direct) {
    return direct;
  }
  if (/嘉義/i.test(hint)) {
    return CHIAYI_ANCHORS;
  }
  if (/東京|tokyo/i.test(hint)) {
    return DESTINATION_ANCHORS.tokyo;
  }
  if (/大阪|osaka/i.test(hint)) {
    return DESTINATION_ANCHORS.osaka;
  }
  if (/北海道|hokkaido|sapporo|札幌|小樽|otaru/i.test(hint)) {
    return DESTINATION_ANCHORS.tokyo;
  }
  if (/日本|japan|nippon/i.test(hint)) {
    return DESTINATION_ANCHORS.tokyo;
  }
  if (/台灣|臺灣|taiwan|taipei|台北|臺北/i.test(hint)) {
    return TAIWAN_FALLBACK_ANCHORS;
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
