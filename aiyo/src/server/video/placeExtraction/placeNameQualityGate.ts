import type { PlaceNameQualityResult } from "@/server/video/placeExtraction/types";

const ROUTING_PREFIXES = [
  "從",
  "由",
  "到",
  "前往",
  "直達",
  "可直達",
  "可以直達",
  "走路去",
  "走路到",
  "步行到",
  "距離",
  "位在",
  "它位在",
  "它就在",
  "就在",
  "靠近",
  "鄰近",
  "回到",
  "抵達",
  "來到",
  "出發",
  "we start from",
  "start from",
  "walk to",
  "we walk to",
  "next stop is",
  "visit",
  "at",
];

const COMMENTARY_PREFIX_PATTERNS = [
  /^(?:市的靈魂|城市的靈魂)\s*/u,
  /^(?:體驗|是體驗|最棒的是|重建後的|對長輩友善的|適合拍照的|必去的|推薦的|走進對長輩極度友善的)\s*/u,
  /^(?:這次會去|這次要去|這次先去)\s*/u,
];

const LEADING_FILLERS = [
  "今天來到",
  "今天第一站",
  "下一站",
  "晚上可以",
  "晚上去",
  "推薦",
  "這次會去",
  "這裡有",
  "這裡",
  "那裡",
  "這邊",
  "附近",
  "this area is",
  "then",
];

const REJECT_EXACT = new Set([
  "這裡",
  "那邊",
  "附近",
  "市區",
  "交通很方便",
  "走路就能到",
  "很適合長輩",
  "超級推薦",
  "這次旅行",
  "今天第一站",
  "下一站",
  "景點",
  "美食",
  "住宿",
  "交通",
  "攻略",
  "很多",
  "this area",
  "tokyo travel",
]);

const GENERIC_LOCATIONS = new Set([
  "日本",
  "台灣",
  "臺灣",
  "韓國",
  "东京",
  "東京",
  "大阪",
  "熊本",
  "嘉義",
  "台北",
  "臺北",
  "台南",
  "臺南",
  "台中",
  "臺中",
  "首爾",
  "서울",
  "日本旅遊",
  "大阪美食",
  "大阪真的很好玩",
  "tokyo",
  "osaka",
  "japan",
  "korea",
]);

const GENERIC_REGIONS = /^(?:市區|附近|郊區|北部|中部|南部|東部|西部|當地|小吃|夜市|老街|商圈|景點|美食|住宿|交通|攻略)$/u;
const PURE_FOOD_NAMES = /^(?:拉麵|寿司|壽司|火雞肉飯|雞肉飯|甜點|小吃|美食|砂鍋魚頭|炸雞|韓國美食)$/iu;
const TRANSCRIPT_STOPWORDS =
  /(我們|大家|今天|接著|然後|再來|可以|就是|真的|其實|因為|所以|而且|如果|這邊|那邊|附近|走路|直達|距離|交通|體驗|推薦|適合|超級|非常|amazing|busy|travel)/iu;
const GENERIC_CITY_COMMENTARY = /(真的很好玩|美食很多|旅遊很方便|travel|amazing|很好玩|很方便|美食)/iu;
const CJK_POI_SUFFIX =
  /(車站|站|駅|入口站|巴士總站|バスターミナル|商圈|夜市|市場|老街|城|塔|公園|博物館|美術館|寺|神社|宮|街|洞|飯店|酒店|旅館|港|機場|觀景台|餐廳|咖啡廳|咖啡館|總站)$/u;
const ENGLISH_POI_SUFFIX =
  /\b(?:Station|Crossing|Tower|Castle|Market|Night Market|Temple|Shrine|Park|Museum|Cafe|Coffee|Restaurant|Hotel|Airport|Harbor|Port|Terminal|Street)\b/i;
const TRAILING_SENTENCE_BITS =
  /(?:也十分簡單|真的很好吃|很多|逛街|很好玩|旅遊很方便|出發|就能到|很方便).*$/u;
const ENGLISH_FRAGMENT_PREFIX = /^(?:this area|this place|we start|then we|tokyo travel|next stop|today we)/iu;
const CHINESE_FRAGMENT_PREFIX = /^(?:城的交通|交通很方便|這裡有很多|附近很多|晚上可以|今天來到|接著我們)/u;

function normalizeInput(value: string): string {
  return value
    .replace(/臺/g, "台")
    .replace(/[「」『』"“”]/g, "")
    .replace(/[，。！？!?:：;；]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripKnownPrefixes(value: string): string {
  let out = value.trim();
  for (const prefix of ROUTING_PREFIXES.sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`^${escapeRegExp(prefix)}\\s*`, "iu");
    if (pattern.test(out)) {
      out = out.replace(pattern, "").trim();
      break;
    }
  }
  for (const filler of LEADING_FILLERS.sort((a, b) => b.length - a.length)) {
    const pattern = new RegExp(`^${escapeRegExp(filler)}\\s*`, "iu");
    if (pattern.test(out)) {
      out = out.replace(pattern, "").trim();
      break;
    }
  }
  return out.replace(/^(?:市區|當地|附近)+/u, "").trim();
}

function extractPoiLikeMatch(value: string): string | null {
  const matches: string[] = [];
  const cjkPattern =
    /([\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}A-Za-z0-9]{2,20}(?:車站|站|駅|入口站|巴士總站|バスターミナル|商圈|夜市|市場|老街|城|塔|公園|博物館|美術館|寺|神社|宮|街|洞|飯店|酒店|旅館|港|機場|觀景台|餐廳|咖啡廳|咖啡館))/gu;
  const englishPattern =
    /\b([A-Z][A-Za-z0-9'&.-]*(?:\s+[A-Z][A-Za-z0-9'&.-]*){0,5}\s+(?:Station|Crossing|Tower|Castle|Market|Temple|Shrine|Park|Museum|Cafe|Restaurant|Hotel|Airport|Port|Terminal|Street))\b/g;
  let match: RegExpExecArray | null = cjkPattern.exec(value);
  while (match) {
    matches.push(match[1]);
    match = cjkPattern.exec(value);
  }
  match = englishPattern.exec(value);
  while (match) {
    matches.push(match[1]);
    match = englishPattern.exec(value);
  }
  if (matches.length === 0) {
    return null;
  }
  return matches.sort((a, b) => b.length - a.length)[0] || null;
}

function stripCommentaryWrappers(value: string): string {
  let out = value.trim();
  for (let i = 0; i < 3; i += 1) {
    const before = out;
    for (const pattern of COMMENTARY_PREFIX_PATTERNS) {
      out = out.replace(pattern, "").trim();
    }
    if (before === out) {
      break;
    }
  }
  out = out.replace(TRAILING_SENTENCE_BITS, "").trim();
  return out;
}

function tokenCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}

function hasPoiShape(value: string): boolean {
  return CJK_POI_SUFFIX.test(value) || ENGLISH_POI_SUFFIX.test(value);
}

export function cleanRoutingPhraseToPlaceName(input: string): string | null {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return null;
  }
  let cleaned = stripCommentaryWrappers(stripKnownPrefixes(normalized));
  const extracted = extractPoiLikeMatch(cleaned);
  if (extracted) {
    cleaned = extracted;
  }
  cleaned = cleaned.replace(/^(?:的)+/u, "").replace(/(?:出發|逛街)$/u, "").trim();
  if (!cleaned) {
    return null;
  }
  return cleaned;
}

export function isLikelyTranscriptFragment(input: string): boolean {
  const normalized = normalizeInput(input);
  if (!normalized) {
    return true;
  }
  if (REJECT_EXACT.has(normalized.toLowerCase()) || REJECT_EXACT.has(normalized)) {
    return true;
  }
  if (ENGLISH_FRAGMENT_PREFIX.test(normalized) || CHINESE_FRAGMENT_PREFIX.test(normalized)) {
    return true;
  }
  if (normalized.length > 24 && TRANSCRIPT_STOPWORDS.test(normalized) && !hasPoiShape(normalized)) {
    return true;
  }
  const stopwordHits = (normalized.match(new RegExp(TRANSCRIPT_STOPWORDS.source, "giu")) || []).length;
  if (stopwordHits >= 2 && !hasPoiShape(normalized)) {
    return true;
  }
  if (/[\s]/.test(normalized) && tokenCount(normalized) > 6) {
    return true;
  }
  if (/[\p{Script=Han}]/u.test(normalized) && normalized.length > 15 && !hasPoiShape(normalized)) {
    return true;
  }
  return false;
}

export function validatePoiNameQuality(
  input: string,
  options?: {
    destinationHint?: string;
    allowStation?: boolean;
    allowDistrict?: boolean;
  },
): PlaceNameQualityResult {
  const original = normalizeInput(input);
  if (!original) {
    return { accepted: false, rejectedReason: "empty" };
  }

  let cleaned = cleanRoutingPhraseToPlaceName(original) || original;
  cleaned = stripCommentaryWrappers(cleaned);
  const extracted = extractPoiLikeMatch(cleaned);
  if (extracted) {
    cleaned = extracted;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  if (!cleaned) {
    return { accepted: false, rejectedReason: "empty-after-cleaning" };
  }
  if (isLikelyTranscriptFragment(original) && !hasPoiShape(cleaned)) {
    return { accepted: false, rejectedReason: "transcript-fragment" };
  }
  if (REJECT_EXACT.has(cleaned.toLowerCase()) || REJECT_EXACT.has(cleaned)) {
    return { accepted: false, rejectedReason: "generic-fragment" };
  }
  if (GENERIC_REGIONS.test(cleaned) || GENERIC_LOCATIONS.has(cleaned)) {
    return { accepted: false, rejectedReason: "generic-location" };
  }
  const lowerCleaned = cleaned.toLowerCase();
  const genericPrefix = Array.from(GENERIC_LOCATIONS).find((location) =>
    lowerCleaned.startsWith(location.toLowerCase()),
  );
  if (genericPrefix && genericPrefix !== cleaned && !hasPoiShape(cleaned) && GENERIC_CITY_COMMENTARY.test(cleaned)) {
    return { accepted: false, rejectedReason: "generic-location-commentary" };
  }
  if (options?.destinationHint) {
    const normalizedDestination = normalizeInput(options.destinationHint).toLowerCase();
    if (cleaned.toLowerCase() === normalizedDestination) {
      return { accepted: false, rejectedReason: "destination-only" };
    }
  }
  if (PURE_FOOD_NAMES.test(cleaned)) {
    return { accepted: false, rejectedReason: "pure-food-name" };
  }
  if (/熊本車$/u.test(cleaned)) {
    return { accepted: false, rejectedReason: "truncated-place-name" };
  }
  if (!options?.allowStation && /(?:車站|站|駅|Station)$/iu.test(cleaned) && cleaned.length <= 1) {
    return { accepted: false, rejectedReason: "invalid-station" };
  }
  if (!options?.allowDistrict && /^(?:市區|商圈)$/u.test(cleaned)) {
    return { accepted: false, rejectedReason: "generic-district" };
  }
  if (/[\p{Script=Han}]/u.test(cleaned) && cleaned.length > 15 && TRANSCRIPT_STOPWORDS.test(cleaned)) {
    return { accepted: false, rejectedReason: "too-long-with-verbs" };
  }
  if (/[A-Za-z]/.test(cleaned) && tokenCount(cleaned) > 6) {
    return { accepted: false, rejectedReason: "too-many-english-tokens" };
  }
  if (TRANSCRIPT_STOPWORDS.test(cleaned) && !hasPoiShape(cleaned) && cleaned.length > 8) {
    return { accepted: false, rejectedReason: "contains-transcript-stopwords" };
  }

  return {
    accepted: true,
    cleanedName: cleaned,
    warnings: cleaned !== original ? ["cleaned-from-routing-or-commentary"] : undefined,
  };
}
