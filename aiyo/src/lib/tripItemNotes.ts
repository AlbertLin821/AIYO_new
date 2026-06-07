const CANNED_TRIP_ITEM_NOTE_PATTERNS = [
  /^安排停留\s*.+[。.]?$/u,
  /^安排在\s*.+\s*用餐[。.]?$/u,
  /^於\s*.+一帶安排(?:午餐|晚餐)[。.]?$/u,
  /^Visit\s+.+[.]?$/iu,
  /^Dine at\s+.+[.]?$/iu,
  /^(?:Lunch|Dinner) near\s+.+[.]?$/iu,
  /^依照目前旅遊需求安排的停靠點$/u,
  /^依照目前旅遊需求安排的用餐建議$/u,
] as const;

export function isCannedTripItemNote(note?: string | null, title?: string): boolean {
  const normalized = (note || "").trim();
  if (!normalized) {
    return false;
  }
  if (CANNED_TRIP_ITEM_NOTE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }
  if (title) {
    const trimmedTitle = title.trim();
    if (
      normalized === `安排停留 ${trimmedTitle}。` ||
      normalized === `安排在 ${trimmedTitle} 用餐。` ||
      normalized === `Visit ${trimmedTitle}.` ||
      normalized === `Dine at ${trimmedTitle}.`
    ) {
      return true;
    }
  }
  return false;
}

export function resolveTripItemDisplayNote(note?: string | null, title?: string): string | undefined {
  const value = (note || "").trim();
  if (!value || isCannedTripItemNote(value, title)) {
    return undefined;
  }
  return value;
}
