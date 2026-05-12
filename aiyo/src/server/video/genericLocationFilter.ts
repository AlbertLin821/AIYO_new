import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";

const GENERIC_SUFFIX_PATTERNS = [
  /(美食|景點|旅遊|行程|攻略|小吃)$/i,
  /(travel|food|guide|itinerary)$/i,
];

/** 常見搜尋式／地區類別片語，非明確店名 */
const SEARCHY_OR_DISTRICT_PATTERN =
  /^(傳統市場|夜市|老街|附近|一個市場|私藏咖啡廳|市場|商圈)$/u;

const COUNT_PLUS_CATEGORY = /^\d+\s*間/u;

/** 地區+類型但無引號／無明確品牌（例：大稻埕老宅咖啡廳） */
const DISTRICT_VIBE_CAFE_HEURISTIC = /^.{2,8}(老宅|巷弄|私藏|隱藏).{0,6}(咖啡廳|咖啡館|餐廳)$/u;

const FILLER_LIKE = new Set([
  "這間",
  "這家",
  "今天",
  "影片",
  "我們現在來到",
  "接下來",
  "then",
  "next",
  "today",
]);

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isGenericTravelLocation(input: {
  name: string;
  destinationHint?: string;
  profile: TravelExtractionProfile;
}): boolean {
  const name = normalize(input.name);
  const lower = name.toLowerCase();
  if (!name) {
    return true;
  }

  const destination = normalize(input.destinationHint || "").toLowerCase();
  if (destination && lower === destination) {
    return true;
  }

  const genericNames = new Set(input.profile.genericLocationNames.map((item) => item.toLowerCase()));
  if (genericNames.has(lower)) {
    return true;
  }

  const genericTerms = new Set(input.profile.genericTravelTerms.map((item) => item.toLowerCase()));
  if (genericTerms.has(lower)) {
    return true;
  }

  if (FILLER_LIKE.has(lower)) {
    return true;
  }

  if (GENERIC_SUFFIX_PATTERNS.some((pattern) => pattern.test(name))) {
    const hasPlaceSuffix = input.profile.placeSuffixes.some((suffix) => lower.endsWith(suffix.toLowerCase()));
    if (!hasPlaceSuffix) {
      return true;
    }
  }

  // 城市 + 美食/旅遊 類別短語應過濾
  const isCityPlusTerm = input.profile.genericLocationNames.some((city) => {
    const c = city.toLowerCase();
    return lower.startsWith(c) && c !== lower && /(美食|景點|旅遊|行程|攻略|travel|food|guide|itinerary)/i.test(lower);
  });
  if (isCityPlusTerm) {
    return true;
  }

  if (SEARCHY_OR_DISTRICT_PATTERN.test(name)) {
    return true;
  }

  if (COUNT_PLUS_CATEGORY.test(name)) {
    return true;
  }

  if (DISTRICT_VIBE_CAFE_HEURISTIC.test(name) && !/[「」『』"“”]/.test(name)) {
    return true;
  }

  return false;
}
