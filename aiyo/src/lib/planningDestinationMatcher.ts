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

function isExcludedMention(text: string, start: number, end: number): boolean {
  const before = text.slice(0, start);
  const after = text.slice(end);
  return /(?:不要|不想|不打算|不用|不需要|別|别)(?:再)?(?:幫我|帮我)?(?:安排|規劃|规划|加入|包含|去|前往|造訪|到|遊覽|游览|參觀|参观|排)?\s*$/iu.test(before)
    || /(?:不去|不是|避免|避開|避开|排除|略過|略过)\s*$/u.test(before)
    || /\b(?:avoid|exclude|skip|without|not|don't|do not)(?:\s+(?:go(?:ing)?\s+to|visit(?:ing)?|include|want\s+to\s+visit))?\s*$/iu.test(before)
    || /^\s*(?:先)?(?:不要(?:去|安排|加入)?|不去|排除)(?=[，,。.!！；;\s]|$)/u.test(after);
}

/** Longest positive alias; excluded destinations must not change the trip scope. */
export function matchDestinationInPlanningText(text: string): string | undefined {
  const normalized = text.trim();
  if (!normalized) {
    return undefined;
  }
  const lower = normalized.toLowerCase();

  const mentions: Array<{ row: AliasRow; start: number; end: number; excluded: boolean }> = [];
  for (const row of getAliasRows()) {
    const haystack = row.isLatin ? lower : normalized;
    const needle = row.isLatin ? row.lower : row.alias;
    let start = haystack.indexOf(needle);
    while (start !== -1) {
      const end = start + needle.length;
      // Latin names must be words, not substrings such as "Paris" in "comparison".
      if (!row.isLatin || (!/[a-z]/i.test(haystack[start - 1] || "") && !/[a-z]/i.test(haystack[end] || ""))) {
        mentions.push({ row, start, end, excluded: isExcludedMention(normalized, start, end) });
      }
      start = haystack.indexOf(needle, end);
    }
  }
  const excluded = mentions.filter(mention => mention.excluded);
  for (const mention of [...mentions].sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (!mention.excluded && excluded.some(range => range.end <= mention.start && /^\s*(?:、|和|與|与|及|或|以及|and|or)\s*$/iu.test(normalized.slice(range.end, mention.start)))) {
      mention.excluded = true;
      excluded.push(mention);
    }
  }
  const positive = mentions.filter(mention => !excluded.some(range => mention.start >= range.start && mention.end <= range.end));
  const first = positive[0];
  if (!first) return undefined;
  // Disambiguation also sees only positive mentions (e.g. 九州，不去熊本).
  return resolveDestinationDisambiguation(first.row.canonical, positive.map(mention => mention.row.canonical).join(" "));
}
