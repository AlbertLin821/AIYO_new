/** Normalized token for comparing place names across segments and extracted lists. */
export function normalizeLocationNameToken(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, "")
    .replace(/臺/g, "台")
    .toLowerCase();
}

/** True when two place labels likely refer to the same POI (exact or substring). */
export function locationNamesFuzzyMatch(a: string, b: string): boolean {
  const na = normalizeLocationNameToken(a);
  const nb = normalizeLocationNameToken(b);
  if (!na || !nb) {
    return false;
  }
  return na === nb || na.includes(nb) || nb.includes(na);
}

export function locationListIncludesName(names: string[], candidate: string): boolean {
  return names.some((name) => locationNamesFuzzyMatch(name, candidate));
}

export function locationReferencesIncludeName(
  locations: Array<{ name: string }>,
  candidate: string,
): boolean {
  return locations.some((loc) => locationNamesFuzzyMatch(loc.name, candidate));
}
