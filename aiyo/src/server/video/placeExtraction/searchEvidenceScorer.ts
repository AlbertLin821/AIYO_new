import type { WebSearchResult } from "@/server/search/webSearchTypes";

export type SearchEvidenceScore = {
  accepted: boolean;
  score: number;
  reason: string;
  bestResult?: {
    title: string;
    url: string;
    content: string;
  };
};

const EVIDENCE_TERMS =
  /(address|map|station|restaurant|attraction|museum|temple|hotel|district|market|terminal|official|景點|地址|地圖|車站|餐廳|商圈|夜市|市場|巴士總站|機場|飯店)/iu;
const TRUSTED_DOMAIN_HINTS = [
  "google.com",
  "maps.google",
  "wikipedia.org",
  "wikivoyage.org",
  "tripadvisor.",
  "japan-guide.com",
  "klook.",
  "kkday.",
  "tabelog.",
  "openstreetmap.org",
];
const LOW_QUALITY_CONTENT_HINTS = /(youtube|instagram|facebook|x\.com|twitter|threads|tiktok)/iu;

function compact(value: string): string {
  return value.toLowerCase().replace(/臺/g, "台").replace(/[^\p{Letter}\p{Number}]+/gu, "");
}

function containsAnyAlias(text: string, aliases: string[]): boolean {
  const hay = compact(text);
  return aliases.some((alias) => {
    const needle = compact(alias);
    return Boolean(needle) && hay.includes(needle);
  });
}

export function scoreSearchEvidence(input: {
  candidateName: string;
  canonicalName: string;
  aliases: string[];
  destinationHint?: string;
  results: WebSearchResult[];
}): SearchEvidenceScore {
  let best: SearchEvidenceScore | null = null;
  const aliases = Array.from(new Set([input.canonicalName, input.candidateName, ...input.aliases].filter(Boolean)));

  for (const result of input.results) {
    const joined = `${result.title} ${result.content}`;
    const aliasHit = containsAnyAlias(joined, aliases);
    const semanticHit = EVIDENCE_TERMS.test(joined);
    const domainHit = TRUSTED_DOMAIN_HINTS.some((hint) => result.url.toLowerCase().includes(hint));
    const destinationHit = input.destinationHint
      ? compact(joined).includes(compact(input.destinationHint))
      : false;
    const lowQuality = LOW_QUALITY_CONTENT_HINTS.test(result.url);
    const conditionsMet = [aliasHit, semanticHit, domainHit, destinationHit].filter(Boolean).length;
    const score =
      (aliasHit ? 0.45 : 0) +
      (semanticHit ? 0.22 : 0) +
      (domainHit ? 0.2 : 0) +
      (destinationHit ? 0.13 : 0) -
      (lowQuality ? 0.25 : 0);
    const current: SearchEvidenceScore = {
      accepted: conditionsMet >= 2 && !lowQuality,
      score: Math.max(0, Math.min(1, score)),
      reason: `alias=${aliasHit}; semantic=${semanticHit}; domain=${domainHit}; destination=${destinationHit}; lowQuality=${lowQuality}`,
      bestResult: {
        title: result.title,
        url: result.url,
        content: result.content,
      },
    };
    if (!best || current.score > best.score) {
      best = current;
    }
  }

  return (
    best || {
      accepted: false,
      score: 0,
      reason: "no-search-results",
    }
  );
}
