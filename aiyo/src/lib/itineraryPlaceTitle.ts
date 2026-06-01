const INTEREST_PREFIX_PATTERNS = [
  /^歷史文化體驗\s+/u,
  /^美食探索\s+/u,
  /^自然風光\s+/u,
  /^在地文化\s+/u,
  /^城市漫遊\s+/u,
  /^local culture\s+/iu,
  /^history(?:\s+and\s+culture)?\s+experience\s+/iu,
  /^food(?:\s+exploration)?\s+/iu,
];

const MEAL_TITLE_SUFFIX_PATTERNS = [
  /\s*周邊午餐$/u,
  /\s*晚餐與散步$/u,
  /\s*附近午餐$/u,
  /\s*附近晚餐$/u,
  /\s*lunch stop$/iu,
  /\s*dinner and walk$/iu,
];

const SYNTHETIC_FALLBACK_PATTERNS = [
  /^(.+?)老城區散步$/u,
  /^(.+?)河岸散策$/u,
  /^(.+?)文創街區$/u,
  /^(.+?)在地市場$/u,
  /^(.+?)夜景收尾$/u,
  /^(.+?)\s+old town walk$/iu,
  /^(.+?)\s+riverside stroll$/iu,
  /^(.+?)\s+creative district$/iu,
  /^(.+?)\s+local market$/iu,
  /^(.+?)\s+evening viewpoint$/iu,
];

export function normalizePlaceLookupKey(value: string | undefined | null): string {
  return (value || "")
    .trim()
    .toLowerCase()
    .replace(/[（(].*?[）)]/gu, "")
    .replace(/\s+/g, "");
}

export function extractPrimaryPlaceName(title: string): string {
  let name = title.trim();
  if (!name) {
    return name;
  }

  for (const pattern of MEAL_TITLE_SUFFIX_PATTERNS) {
    name = name.replace(pattern, "").trim();
  }
  for (const pattern of INTEREST_PREFIX_PATTERNS) {
    name = name.replace(pattern, "").trim();
  }

  return name || title.trim();
}

export function isMealSyntheticTitle(title: string): boolean {
  const trimmed = title.trim();
  if (!trimmed) {
    return false;
  }
  return MEAL_TITLE_SUFFIX_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function isSyntheticFallbackPlaceName(name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) {
    return false;
  }
  return SYNTHETIC_FALLBACK_PATTERNS.some((pattern) => pattern.test(trimmed));
}

export function shouldSkipDedicatedMapPinForItem(input: {
  title: string;
  type?: string;
}): boolean {
  if (isMealSyntheticTitle(input.title)) {
    return true;
  }
  const primary = extractPrimaryPlaceName(input.title);
  return isSyntheticFallbackPlaceName(primary);
}

export function parseDayThemeStops(input: {
  dayNumber: number;
  theme?: string | null;
  summary?: string | null;
}): { morning: string; afternoon: string } {
  const themeBase = (input.theme || "").replace(/\s*(與周邊順遊|順遊)$/u, "").trim();
  const summary = (input.summary || "").trim();
  const pairMatch = summary.match(/第\s*\d+\s*天以\s*(.+?)、(.+?)\s*與沿線餐食安排為主/u);

  const themedStops = themeBase
    .split(/[・／/、]/u)
    .map((value) => extractPrimaryPlaceName(value.trim()))
    .filter(Boolean);

  const morning =
    themedStops[0] ||
    (pairMatch?.[1] ? extractPrimaryPlaceName(pairMatch[1].trim()) : "") ||
    extractPrimaryPlaceName(themeBase) ||
    `第 ${input.dayNumber} 天`;
  const afternoon =
    themedStops[1] ||
    (pairMatch?.[2] ? extractPrimaryPlaceName(pairMatch[2].trim()) : "") ||
    morning;

  return { morning, afternoon };
}

export type ItineraryTitleViolation =
  | "interest_prefix"
  | "meal_suffix"
  | "synthetic_fallback"
  | "multi_place";

/** Returns why a title violates the itinerary item title contract, or null if acceptable. */
export function getItineraryItemTitleViolation(title: string): ItineraryTitleViolation | null {
  const trimmed = title.trim();
  if (!trimmed) {
    return null;
  }

  for (const pattern of INTEREST_PREFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "interest_prefix";
    }
  }
  for (const pattern of MEAL_TITLE_SUFFIX_PATTERNS) {
    if (pattern.test(trimmed)) {
      return "meal_suffix";
    }
  }
  if (isSyntheticFallbackPlaceName(trimmed)) {
    return "synthetic_fallback";
  }
  const placeSegments = trimmed
    .split(/[・／/、]/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (placeSegments.length > 1) {
    return "multi_place";
  }
  return null;
}

export function formatItineraryTitleViolationMessage(violation: ItineraryTitleViolation): string {
  switch (violation) {
    case "interest_prefix":
      return "title must not combine interest labels with place names; put interests in theme or notes only";
    case "meal_suffix":
      return "title must be a concrete venue name; put meal context in notes, not in title";
    case "synthetic_fallback":
      return "title must be a searchable place name, not a generic route template";
    case "multi_place":
      return "title must name one stop only; split multiple places into separate items";
  }
}
