import type { PlaceMention } from "@/server/video/placeMentionExtractor";
import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";

function normalizePunctuation(name: string): string {
  return name
    .replace(/臺/g, "台")
    .replace(/[「」『』]/g, "")
    .replace(/[，,。.!！?？:：]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PLACE_ALIASES: Record<string, string> = {
  文化夜市: "文化路夜市",
  嘉義文化夜市: "文化路夜市",
  嘉義文化路夜市: "文化路夜市",
  "東京 Tokyo Tower": "Tokyo Tower",
};

function normalizeAliasKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase();
}

function applyKnownAlias(name: string): string {
  const direct = PLACE_ALIASES[name];
  if (direct) {
    return direct;
  }

  const normalized = normalizeAliasKey(name);
  return Object.entries(PLACE_ALIASES).find(([alias]) => normalizeAliasKey(alias) === normalized)?.[1] || name;
}

export function normalizePlaceMentionName(name: string, profile: TravelExtractionProfile): string {
  let out = normalizePunctuation(name);
  for (const filler of profile.fillerPrefixes) {
    if (out.toLowerCase().startsWith(filler.toLowerCase())) {
      out = out.slice(filler.length).trim();
    }
  }
  out = out.replace(/^(這間|這家|來到|下一站|推薦|必吃|必去)\s*/i, "").trim();
  return applyKnownAlias(out);
}

function betterName(a: string, b: string): string {
  const canonicalA = applyKnownAlias(a);
  const canonicalB = applyKnownAlias(b);
  if (canonicalA !== a) {
    return canonicalA;
  }
  if (canonicalB !== b) {
    return canonicalB;
  }
  if (a.includes("路") && a.includes("夜市")) {
    return a;
  }
  if (b.includes("路") && b.includes("夜市")) {
    return b;
  }
  return a.length >= b.length ? a : b;
}

export function dedupePlaceMentions(mentions: PlaceMention[]): PlaceMention[] {
  const sorted = mentions
    .map((mention) => {
      const name = applyKnownAlias(normalizePunctuation(mention.name));
      return {
        ...mention,
        name,
        normalizedName: name.toLowerCase().replace(/\s+/g, ""),
      };
    })
    .sort((left, right) => left.startSeconds - right.startSeconds);
  const out: PlaceMention[] = [];

  for (const mention of sorted) {
    const near = out.find((item) => {
      const sameName =
        item.normalizedName === mention.normalizedName ||
        item.normalizedName.includes(mention.normalizedName) ||
        mention.normalizedName.includes(item.normalizedName);
      const closeTime = Math.abs(item.startSeconds - mention.startSeconds) <= 90;
      return sameName && closeTime;
    });

    if (!near) {
      out.push({ ...mention });
      continue;
    }

    near.name = betterName(near.name, mention.name);
    near.normalizedName = near.name.toLowerCase().replace(/\s+/g, "");
    near.startSeconds = Math.min(near.startSeconds, mention.startSeconds);
    near.endSeconds = Math.max(near.endSeconds, mention.endSeconds);
    near.confidence = Math.max(near.confidence, mention.confidence);
    if ((mention.context || "").length > (near.context || "").length) {
      near.context = mention.context;
    }
    const mergedFoods = new Set([...(near.foods || []), ...(mention.foods || [])]);
    near.foods = mergedFoods.size ? Array.from(mergedFoods) : undefined;
    const mergedIds = new Set([...(near.sourceTranscriptLineIds || []), ...(mention.sourceTranscriptLineIds || [])]);
    near.sourceTranscriptLineIds = mergedIds.size ? Array.from(mergedIds) : undefined;
  }

  return out;
}
