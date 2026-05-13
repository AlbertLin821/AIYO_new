import type {
  SimpleExtractedFood,
  SimpleExtractedPlace,
  SimpleVideoExtractionChunkResult,
} from "@/server/video/simpleExtraction/types";

const PLACE_PREFIXES = [
  "從",
  "到",
  "前往",
  "直達",
  "可直達",
  "走路去",
  "步行到",
  "距離",
  "位在",
  "它位在",
  "它就在",
  "靠近",
  "鄰近",
];

const SENTENCE_WORDS = ["今天", "我們", "接著", "然後", "這裡", "那裡", "附近", "很多", "推薦", "可以", "就是", "真的"];

const PLACE_TYPE_PRIORITY: Record<NonNullable<SimpleExtractedPlace["type"]>, number> = {
  restaurant: 9,
  shop: 8,
  attraction: 7,
  landmark: 6,
  market: 5,
  station: 4,
  district: 3,
  hotel: 2,
  transport: 1,
  unknown: 0,
};

const STATION_ALIASES: Record<string, string> = {
  熊本站: "熊本車站",
  熊本駅: "熊本車站",
  熊本车站: "熊本車站",
};

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeComparisonKey(value: string): string {
  return normalizeWhitespace(value)
    .replace(/[「」『』【】（）()\[\]'"`]/g, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function stripKnownPrefixes(value: string): string {
  let current = normalizeWhitespace(value);
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of PLACE_PREFIXES) {
      if (current.startsWith(prefix) && current.length > prefix.length) {
        current = current.slice(prefix.length).replace(/^[：:，,、\s]+/, "").trim();
        changed = true;
      }
    }
  }
  return current;
}

function isSentenceLikeName(value: string): boolean {
  return SENTENCE_WORDS.some((token) => value.includes(token));
}

function canonicalizePlaceName(name: string): string {
  const stripped = stripKnownPrefixes(name)
    .replace(/[。！？!?].*$/u, "")
    .replace(/^[「『【(（\[]+/, "")
    .replace(/[」』】)）\]]+$/, "")
    .trim();
  return STATION_ALIASES[stripped] || stripped;
}

function canonicalizeFoodName(name: string): string {
  return normalizeWhitespace(name)
    .replace(/[。！？!?].*$/u, "")
    .replace(/^[「『【(（\[]+/, "")
    .replace(/[」』】)）\]]+$/, "")
    .trim();
}

function mergePlace(existing: SimpleExtractedPlace | undefined, next: SimpleExtractedPlace): SimpleExtractedPlace {
  if (!existing) {
    return next;
  }
  const existingTypeScore = PLACE_TYPE_PRIORITY[existing.type || "unknown"];
  const nextTypeScore = PLACE_TYPE_PRIORITY[next.type || "unknown"];
  return {
    name: existing.name,
    type: nextTypeScore > existingTypeScore ? next.type : existing.type,
    evidence: existing.evidence || next.evidence,
    startSeconds:
      typeof existing.startSeconds === "number"
        ? existing.startSeconds
        : next.startSeconds,
  };
}

function mergeFood(existing: SimpleExtractedFood | undefined, next: SimpleExtractedFood): SimpleExtractedFood {
  if (!existing) {
    return next;
  }
  return {
    name: existing.name,
    evidence: existing.evidence || next.evidence,
    startSeconds:
      typeof existing.startSeconds === "number"
        ? existing.startSeconds
        : next.startSeconds,
  };
}

export function mergeSimpleExtractionResults(input: {
  chunkResults: SimpleVideoExtractionChunkResult[];
}): {
  places: SimpleExtractedPlace[];
  foods: SimpleExtractedFood[];
} {
  const foodMap = new Map<string, SimpleExtractedFood>();
  for (const result of input.chunkResults) {
    for (const food of result.foods) {
      const name = canonicalizeFoodName(food.name);
      if (!name || isSentenceLikeName(name)) {
        continue;
      }
      const key = normalizeComparisonKey(name);
      if (!key) {
        continue;
      }
      foodMap.set(
        key,
        mergeFood(foodMap.get(key), {
          ...food,
          name,
        }),
      );
    }
  }

  const placesMap = new Map<string, SimpleExtractedPlace>();
  for (const result of input.chunkResults) {
    for (const place of result.places) {
      const name = canonicalizePlaceName(place.name);
      if (!name || isSentenceLikeName(name)) {
        continue;
      }
      const key = normalizeComparisonKey(name);
      if (!key) {
        continue;
      }
      const sameAsFood = foodMap.has(key);
      if (sameAsFood && place.type !== "restaurant" && place.type !== "shop") {
        continue;
      }
      placesMap.set(
        key,
        mergePlace(placesMap.get(key), {
          ...place,
          name,
        }),
      );
    }
  }

  return {
    places: [...placesMap.values()].slice(0, 24),
    foods: [...foodMap.values()].slice(0, 24),
  };
}
