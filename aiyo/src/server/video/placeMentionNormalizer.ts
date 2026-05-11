import type { PlaceMention } from "@/server/video/placeMentionExtractor";
import type { TravelExtractionProfile } from "@/server/video/travelExtractionProfiles";
import { isGenericTravelLocation } from "@/server/video/genericLocationFilter";

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

const CLAUSE_SPLIT = /[，,。.!！?？；;、\n\r]/u;
const LEADING_FILLER_PATTERN =
  /^(?:我們|我|你|大家|今天|明天|昨天|早上|上午|中午|下午|傍晚|晚上|晚點|隔天|第二天|第一天|day\s*\d+|接著|然後|再來|接下來|下一站|最後|順便|直接|可以|先|再|就|也|以及|及|和|跟|到|去|走到|走去|來到|抵達|前往|拜訪|逛|逛逛|入住|回|回到|看看|品嚐|吃|喝|推薦|必吃|必去|附近|這邊|這裡|那邊|那裡|等)+/iu;
const VERB_ONLY_PHRASE_PATTERN =
  /^(?:走路就能|等.*回|回|入住|附近|這邊|這裡|那邊|那裡|可以|先|再|就|逛|吃|喝|買|看)/u;
const GENERIC_REMAINDER_PATTERN =
  /^(?:夜市|美食|飯店|酒店|住宿|附近|市區|景點|小吃|餐廳|早餐|午餐|晚餐|伴手禮|行程|攻略|交通|停車位|位置|地方)$/u;
const SENTENCE_ONLY_GENERIC_PATTERN =
  /(?:走路就能|等.*回|附近很多|這邊附近|這裡附近|不用煩惱|很方便|很多).*(夜市|美食|飯店|酒店|住宿|市區|小吃|餐廳|停車位)/u;
const KNOWN_KEEPERS = [
  "郭家火雞肉飯",
  "民主火雞肉飯",
  "林聰明砂鍋魚頭",
  "文化路夜市",
  "旺來山鳳梨文化園區",
  "檜意森活村",
  "北門驛",
];

function stripLeadingFillers(value: string, profile: TravelExtractionProfile): string {
  let out = value.trim();
  for (const filler of profile.fillerPrefixes) {
    if (out.toLowerCase().startsWith(filler.toLowerCase())) {
      out = out.slice(filler.length).trim();
    }
  }
  for (let i = 0; i < 4; i += 1) {
    const next = out.replace(LEADING_FILLER_PATTERN, "").trim();
    if (next === out) {
      break;
    }
    out = next;
  }
  return out.replace(/^(這間|這家|來到|下一站|推薦|必吃|必去)\s*/i, "").trim();
}

export function cleanPlaceMentionName(
  name: string,
  profile: TravelExtractionProfile,
  destinationHint?: string,
): { cleanedName: string; rejectedReason?: string } {
  const original = normalizePunctuation(name);
  if (!original) {
    return { cleanedName: "", rejectedReason: "empty" };
  }

  const known = KNOWN_KEEPERS.find((keeper) => original.includes(keeper));
  let out = known || stripLeadingFillers(original.split(CLAUSE_SPLIT)[0] || original, profile);
  out = applyKnownAlias(stripLeadingFillers(out, profile));
  out = out
    .replace(/^(?:及|和|與|跟|、)+/u, "")
    .replace(/(?:這裡|這邊|那裡|那邊|附近|周邊).*$/u, "")
    .trim();

  if (!out || out.length < 2) {
    return { cleanedName: out, rejectedReason: "too-short-after-cleaning" };
  }
  if (!known && SENTENCE_ONLY_GENERIC_PATTERN.test(original)) {
    return { cleanedName: out, rejectedReason: "sentence-only-generic-phrase" };
  }
  if (!known && VERB_ONLY_PHRASE_PATTERN.test(original) && GENERIC_REMAINDER_PATTERN.test(out)) {
    return { cleanedName: out, rejectedReason: "verb-only-generic-phrase" };
  }
  if (GENERIC_REMAINDER_PATTERN.test(out)) {
    return { cleanedName: out, rejectedReason: "generic-term-after-cleaning" };
  }
  if (isGenericTravelLocation({ name: out, destinationHint, profile })) {
    return { cleanedName: out, rejectedReason: "generic-location" };
  }

  return { cleanedName: out };
}

export function normalizePlaceMentionName(name: string, profile: TravelExtractionProfile): string {
  return cleanPlaceMentionName(name, profile).cleanedName;
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
