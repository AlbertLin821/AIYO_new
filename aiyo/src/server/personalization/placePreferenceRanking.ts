import type { PlaceSearchHit } from "@/server/geo/placesSearchService";
import type { TravelPreferences } from "@/types";

type Candidate = Pick<PlaceSearchHit, "name"> & Partial<Pick<PlaceSearchHit, "types">>;
type Preferences = Partial<TravelPreferences>;

const CATEGORIES: Array<{ terms: string[]; types: string[] }> = [
  { terms: ["food", "美食", "餐廳", "餐厅"], types: ["restaurant", "food", "cafe", "bakery"] },
  { terms: ["coffee", "咖啡", "咖啡廳"], types: ["cafe"] },
  { terms: ["shopping", "購物", "购物", "逛街"], types: ["shopping_mall", "department_store", "store"] },
  { terms: ["museum", "museums", "博物館", "博物馆"], types: ["museum"] },
  { terms: ["art", "藝術", "艺术", "美術館"], types: ["art_gallery"] },
  { terms: ["nature", "自然", "自然風景", "公園", "公园"], types: ["park", "national_park", "natural_feature"] },
  { terms: ["history", "culture", "歷史", "历史", "文化"], types: ["museum", "historical_landmark", "cultural_landmark"] },
  { terms: ["nightlife", "夜生活", "酒吧"], types: ["bar", "night_club"] },
];

function normalize(value: string): string {
  return value.normalize("NFKC").trim().toLowerCase().replace(/\s+/gu, " ");
}

function containsTerm(value: string, term: string): boolean {
  if (term.length < 2) return false;
  if (/^[a-z0-9 _-]+$/u.test(term)) {
    // "art" must not match "mart"; non-Latin names use literal substring matching.
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`, "u").test(value);
  }
  return value.includes(term);
}

function matches(candidate: Candidate, rawTerm: string): boolean {
  const term = normalize(rawTerm);
  if (!term) return false;
  const types = (candidate.types || []).map(normalize);
  if (containsTerm(normalize(candidate.name), term) || types.includes(term)) return true;
  const category = CATEGORIES.find((entry) => entry.terms.includes(term));
  return Boolean(category?.types.some((type) => types.includes(type)));
}

/** Call with already-approved preferences. Explicit fields (including []) replace saved fields. */
export function resolveCandidatePreferences(saved?: Preferences, current?: Preferences): Preferences {
  const resolved: Preferences = { ...saved };
  for (const key of Object.keys(current || {}) as Array<keyof TravelPreferences>) {
    const value = current?.[key];
    if (value !== undefined) Object.assign(resolved, { [key]: value });
  }
  return resolved;
}

/** Stable ranking of verified candidates only; no provider calls or preference inference.
 * Avoidances win conflicts with mustVisit in the resolved preferences. Budget, diet,
 * travel history, pace and transport are not inferred from missing place metadata.
 */
export function rankPlaceCandidates<T extends Candidate>(
  candidates: readonly T[],
  preferences?: Preferences,
  currentOverrides?: Preferences,
): T[] {
  const effective = resolveCandidatePreferences(preferences, currentOverrides);
  const interests = [...new Set((effective.interests || []).map(normalize))];
  return candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => !(effective.avoid || []).some((term) => matches(candidate, term)))
    .map(({ candidate, index }) => ({
      candidate,
      index,
      // Must-visit is a venue name, not a category expansion.
      required: (effective.mustVisit || []).some((term) => containsTerm(normalize(candidate.name), normalize(term))),
      affinity: interests.filter((term) => matches(candidate, term)).length,
    }))
    .sort((a, b) => Number(b.required) - Number(a.required) || b.affinity - a.affinity || a.index - b.index)
    .map(({ candidate }) => candidate);
}
