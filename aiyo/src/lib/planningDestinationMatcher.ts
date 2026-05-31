import catalog from "../../data/planning-destination-catalog.json";

type AliasRow = {
  alias: string;
  canonical: string;
  lower: string;
  isLatin: boolean;
};

let aliasRows: AliasRow[] | null = null;

function buildAliasRows(): AliasRow[] {
  const rows: AliasRow[] = [];
  for (const entry of catalog.entries) {
    for (const alias of entry.aliases) {
      const trimmed = alias.trim();
      if (trimmed.length < 2) {
        continue;
      }
      const isLatin = /^[\x00-\x7F]+$/u.test(trimmed);
      rows.push({
        alias: trimmed,
        canonical: entry.canonical,
        lower: trimmed.toLowerCase(),
        isLatin,
      });
    }
  }
  rows.sort((a, b) => b.alias.length - a.alias.length);
  return rows;
}

function getAliasRows(): AliasRow[] {
  if (!aliasRows) {
    aliasRows = buildAliasRows();
  }
  return aliasRows;
}

function resolveDestinationDisambiguation(
  destination: string,
  normalized: string,
): string {
  if (/^東基$|^東急$/u.test(destination)) {
    return "東京";
  }
  if (destination === "九州") {
    if (/熊本/u.test(normalized)) {
      return "熊本";
    }
    if (/福岡/u.test(normalized)) {
      return "福岡";
    }
  }
  return destination;
}

/** Longest-alias scan against planning-destination-catalog.json (data-driven, not hand-maintained regex). */
export function matchDestinationInPlanningText(text: string): string | undefined {
  const normalized = text.trim();
  if (!normalized) {
    return undefined;
  }
  const lower = normalized.toLowerCase();

  for (const row of getAliasRows()) {
    const matched = row.isLatin
      ? lower.includes(row.lower)
      : normalized.includes(row.alias);
    if (!matched) {
      continue;
    }
    return resolveDestinationDisambiguation(row.canonical, normalized);
  }

  return undefined;
}
