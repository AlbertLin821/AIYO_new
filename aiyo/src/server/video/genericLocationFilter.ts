import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";

const GENERIC_SUFFIX_PATTERNS = [
  /(美食|景點|旅遊|行程|攻略|小吃)$/i,
  /(travel|food|guide|itinerary)$/i,
];

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

  return false;
}
