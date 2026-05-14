import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import type { AiProposedChange } from "@/types";

function compactComparable(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function overlapScore(a: string, b: string): number {
  const x = compactComparable(a);
  const y = compactComparable(b);
  if (!x || !y) {
    return 0;
  }
  if (x.includes(y) || y.includes(x)) {
    return Math.min(1, Math.min(x.length, y.length) / Math.max(x.length, y.length) + 0.25);
  }
  const xs = new Set([...x]);
  const overlap = [...new Set([...y])].filter((c) => xs.has(c)).length;
  return overlap / Math.max(new Set([...x, ...y]).size, 1);
}

/** 檢查建議項目是否與任一 Google 地點結果足夠接近（避免幻覺店名寫入行程）。 */
export function proposedChangeMatchesAnyPlace(
  change: AiProposedChange,
  places: PlaceSearchHit[],
): boolean {
  if (change.type !== "add_itinerary_item") {
    return true;
  }
  if (!places.length) {
    return false;
  }
  const title = change.title || "";
  const loc = change.locationName || title;
  return places.some((p) => {
    const s = Math.max(overlapScore(title, p.name), overlapScore(loc, p.name));
    return s >= 0.38;
  });
}

export function filterProposedChangesByVerifiedPlaces(
  changes: AiProposedChange[],
  places: PlaceSearchHit[],
): AiProposedChange[] {
  if (!places.length) {
    return changes.filter((change) => change.type !== "add_itinerary_item");
  }
  return changes.filter((c) => proposedChangeMatchesAnyPlace(c, places));
}

/** 影片段落標題是否與任一 Places 結果足夠接近（與 proposedChange 使用相同門檻）。 */
export function segmentTitleMatchesAnyPlace(title: string, places: PlaceSearchHit[]): boolean {
  const t = title.trim();
  if (!t || !places.length) {
    return false;
  }
  return places.some((p) => overlapScore(t, p.name) >= 0.38);
}
