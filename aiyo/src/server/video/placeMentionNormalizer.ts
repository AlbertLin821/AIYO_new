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
  嘉義市立美術館: "嘉義美術館",
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
  /^(?:我們|我|你|大家|今天|明天|昨天|早上|上午|中午|下午|傍晚|晚上|晚點|隔天|第二天|第一天|day\s*\d+|接著|然後|再來|接下來|下一站|最後|順便|直接|可以|先|再|就|也|以及|及|和|跟|到|去|走到|走去|來到|抵達|前往|拜訪|逛|逛逛|入住|回|回到|看看|品嚐|吃|喝|推薦|必吃|必去|附近|這邊|這裡|那邊|那裡|等|參觀完|到了|第一站是|第二站是|第三站是)+/iu;
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

const EMOTION_OR_FILLER_FRAGMENT = /真的是|只能|好好的|滿滿的|滿滿/u;

const DISALLOWED_STANDALONE_SCRIPT =
  /\p{Script=Arabic}|\p{Script=Hebrew}|\p{Script=Syriac}/u;
const SCRIPT_HAS_CJK_OR_LATIN =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]|[A-Za-z]{2,}/u;

/** 行銷／敘述、問路、價格嘴砲、動線描述 — 不應當作 POI 名稱 */
const NARRATIVE_OR_ROUTING_PHRASE = new RegExp(
  [
    "怎麼前往",
    "怎麼去",
    "如何到",
    "要走哪",
    "入住今天",
    "今天要來",
    "現在要來",
    "現在逛完",
    "已經逛完",
    "吃完.{0,6}之後",
    "中午吃完",
    "超好吃",
    "超讚",
    "意外發現",
    "非常划算",
    "[0-9]{2,4}\\s*多塊",
    "大推這",
    "我大推",
    "世上最",
    "最繁忙",
    "最多人參拜",
    "走路\\s*[一二三四五六七八九十\\d零兩]",
    "分鐘能到",
    "步行.{0,4}分鐘",
    "就可以抵達",
    "逛完走",
    "繼續往車站",
    "宮現在我們",
    "現在我們要來吃",
    "它除了是",
  ].join("|"),
  "u",
);

const RELATIONAL_SPURIOUS = /的(?:公車站|巴士站|捷運站|地鐵站|出口|入口|路口|[上下]坡)/u;

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

  if (DISALLOWED_STANDALONE_SCRIPT.test(original) && !SCRIPT_HAS_CJK_OR_LATIN.test(original)) {
    return { cleanedName: "", rejectedReason: "unsupported-script" };
  }

  const known = KNOWN_KEEPERS.find((keeper) => original.includes(keeper));
  let out = known || stripLeadingFillers(original.split(CLAUSE_SPLIT)[0] || original, profile);
  out = applyKnownAlias(stripLeadingFillers(out, profile));
  out = out
    .replace(/^(?:及|和|與|跟|、)+/u, "")
    .replace(/(?:這裡|這邊|那裡|那邊|附近|周邊).*$/u, "")
    .trim();

  out = out.replace(/^的+/u, "").trim();

  out = out.replace(/^[店口路站]\s+/u, "").trim();

  if (!out || out.length < 2) {
    return { cleanedName: out, rejectedReason: "too-short-after-cleaning" };
  }
  if (!known && EMOTION_OR_FILLER_FRAGMENT.test(out)) {
    return { cleanedName: "", rejectedReason: "emotion-or-filler-fragment" };
  }
  if (!known && NARRATIVE_OR_ROUTING_PHRASE.test(out)) {
    return { cleanedName: "", rejectedReason: "narrative-or-routing-phrase" };
  }
  if (!known && RELATIONAL_SPURIOUS.test(out)) {
    return { cleanedName: "", rejectedReason: "relational-site-fragment" };
  }
  const spaceTokens = out.split(/\s+/).filter(Boolean);
  if (!known && spaceTokens.length >= 4) {
    return { cleanedName: "", rejectedReason: "multi-clause-glue" };
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

  const MAX_CLEANED_POI_CHARS = 15;
  if (!known && out.length > MAX_CLEANED_POI_CHARS) {
    return { cleanedName: "", rejectedReason: "name-too-long" };
  }

  return { cleanedName: out };
}

/** 片段標題／擷取前最後一道閘：擋敘述句、問路殘片、過長黏句（不依賴 profile）。 */
export function shouldExcludeAsPoiTitle(name: string): boolean {
  const t = name.trim().replace(/\s+/g, " ");
  if (t.length < 2) {
    return true;
  }
  const known = KNOWN_KEEPERS.find((keeper) => t.includes(keeper));
  if (!known && t.length > 15) {
    return true;
  }
  if (!known && NARRATIVE_OR_ROUTING_PHRASE.test(t)) {
    return true;
  }
  if (!known && RELATIONAL_SPURIOUS.test(t)) {
    return true;
  }
  if (!known && t.split(/\s+/).filter(Boolean).length >= 4) {
    return true;
  }
  return false;
}

export function normalizePlaceMentionName(name: string, profile: TravelExtractionProfile): string {
  return cleanPlaceMentionName(name, profile).cleanedName;
}

function betterName(a: string, b: string): string {
  const canonicalA = applyKnownAlias(normalizePunctuation(a));
  const canonicalB = applyKnownAlias(normalizePunctuation(b));
  if (canonicalA !== canonicalB) {
    return canonicalA.length <= canonicalB.length ? canonicalA : canonicalB;
  }
  return canonicalA;
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
    /** 勿用 includes 合併：短字串會把整句字幕黏成單一「地名」。僅合併 normalized 完全相同且時間接近者。 */
    const near = out.find(
      (item) =>
        item.normalizedName === mention.normalizedName &&
        Math.abs(item.startSeconds - mention.startSeconds) <= 90,
    );

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

function stripForFuzzyKey(name: string): string {
  let s = normalizePunctuation(name).toLowerCase().replace(/\s+/g, "");
  for (let i = 0; i < 4; i += 1) {
    const next = s.replace(LEADING_FILLER_PATTERN, "").replace(/^的+/u, "");
    if (next === s) {
      break;
    }
    s = next;
  }
  return s;
}

function bigramJaccard(a: string, b: string): number {
  if (!a || !b) {
    return a === b ? 1 : 0;
  }
  const bi = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i += 1) {
      set.add(value.slice(i, i + 2));
    }
    return set;
  };
  const A = bi(a);
  const B = bi(b);
  if (A.size === 0 && B.size === 0) {
    return 1;
  }
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) {
      inter += 1;
    }
  }
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * 在時間接近的片段上，合併 normalized 高度相近的地名（補 dedupePlaceMentions 僅完全相同之不足）。
 */
export function fuzzyDedupePlaceMentions(mentions: PlaceMention[], threshold = 0.72): PlaceMention[] {
  const sorted = [...mentions].sort((a, b) => a.startSeconds - b.startSeconds);
  const out: PlaceMention[] = [];

  for (const mention of sorted) {
    const keyA = stripForFuzzyKey(mention.name);
    const near = out.find((item) => {
      const keyB = stripForFuzzyKey(item.name);
      const sim = bigramJaccard(keyA, keyB);
      const timeClose = Math.abs(item.startSeconds - mention.startSeconds) <= 120;
      if (!timeClose) {
        return false;
      }
      if (sim >= threshold) {
        return true;
      }
      const shorter = keyA.length <= keyB.length ? keyA : keyB;
      const longer = keyA.length > keyB.length ? keyA : keyB;
      if (shorter.length >= 4 && longer.includes(shorter) && longer.length - shorter.length <= 8) {
        return true;
      }
      return false;
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
