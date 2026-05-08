import { resolveLocationReference } from "@/server/geo/locationCatalog";

export type PlaceNameExtraction = {
  raw: string;
  normalized: string;
  displayName: string;
};

/** 候選地點（抽取階段），供 geocode 二次驗證使用。 */
export type PlaceCandidate = {
  extraction: PlaceNameExtraction;
  /** 來源：LLM、逐字稿規則、或影片標題中的實際景點關鍵詞。 */
  source: "llm" | "heuristic" | "title-poi";
  /** 抽取樣式分數（約 0–10），尚未乘目的地懲罰。 */
  patternScore: number;
  /** 套用目的地／脈絡 rerank 後的分數。 */
  rerankScore: number;
};

const ALIAS: Record<string, string> = {
  "tokyo tower": "Tokyo Tower",
  "tokyo skytree": "Tokyo Skytree",
  skytree: "Tokyo Skytree",
  shibuya: "Shibuya",
  "shibuya crossing": "Shibuya Crossing",
  asakusa: "Asakusa",
  "senso ji": "Senso-ji",
  sensoji: "Senso-ji",
  "senso-ji": "Senso-ji",
  tsukiji: "Tsukiji Outer Market",
  odaiba: "Odaiba",
  ginza: "Ginza",
  shinjuku: "Shinjuku",
  harajuku: "Harajuku",
  ueno: "Ueno",
  akihabara: "Akihabara",
  roppongi: "Roppongi",
  "kyoto station": "Kyoto Station",
  kyoto: "Kyoto",
  osaka: "Osaka",
  dotonbori: "Dotonbori",
};

/**
 * 影片標題中常見的實際景點／商圈／設施關鍵詞（長詞須排在對應短詞之前，避免先命中過寬詞）。
 */
const TITLE_POI_LEXICON: ReadonlyArray<{ match: string; displayName: string }> = [
  { match: "阿里山國家風景區", displayName: "阿里山國家風景區" },
  { match: "阿里山森林鐵路", displayName: "阿里山森林鐵路" },
  { match: "阿里山", displayName: "阿里山" },
  { match: "日月潭", displayName: "日月潭" },
  { match: "Sun Moon Lake", displayName: "日月潭" },
  { match: "清境農場", displayName: "清境農場" },
  { match: "清境", displayName: "清境" },
  { match: "太魯閣國家公園", displayName: "太魯閣國家公園" },
  { match: "太魯閣", displayName: "太魯閣" },
  { match: "Taroko", displayName: "太魯閣" },
  { match: "九份老街", displayName: "九份老街" },
  { match: "九份", displayName: "九份" },
  { match: "Jiufen", displayName: "九份" },
  { match: "十分瀑布", displayName: "十分瀑布" },
  { match: "十分老街", displayName: "十分老街" },
  { match: "十分", displayName: "十分" },
  { match: "平溪老街", displayName: "平溪老街" },
  { match: "平溪", displayName: "平溪" },
  { match: "菁桐", displayName: "菁桐" },
  { match: "野柳地質公園", displayName: "野柳地質公園" },
  { match: "野柳", displayName: "野柳" },
  { match: "故宮博物院", displayName: "國立故宮博物院" },
  { match: "臺北故宮", displayName: "國立故宮博物院" },
  { match: "台北故宮", displayName: "國立故宮博物院" },
  { match: "台北101", displayName: "台北101" },
  { match: "臺北101", displayName: "台北101" },
  { match: "101大樓", displayName: "台北101" },
  { match: "Taipei 101", displayName: "台北101" },
  { match: "西門町", displayName: "西門町" },
  { match: "士林夜市", displayName: "士林夜市" },
  { match: "寧夏夜市", displayName: "寧夏夜市" },
  { match: "逢甲夜市", displayName: "逢甲夜市" },
  { match: "六合夜市", displayName: "六合夜市" },
  { match: "羅東夜市", displayName: "羅東夜市" },
  { match: "墾丁國家公園", displayName: "墾丁國家公園" },
  { match: "墾丁", displayName: "墾丁" },
  { match: "Kenting", displayName: "墾丁" },
  { match: "龍磐公園", displayName: "龍磐公園" },
  { match: "鵝鑾鼻燈塔", displayName: "鵝鑾鼻燈塔" },
  { match: "愛河", displayName: "愛河" },
  { match: "蓮池潭", displayName: "蓮池潭" },
  { match: "高美濕地", displayName: "高美濕地" },
  { match: "武陵農場", displayName: "武陵農場" },
  { match: "太平山國家森林遊樂區", displayName: "太平山國家森林遊樂區" },
  { match: "太平山", displayName: "太平山" },
  { match: "合歡山", displayName: "合歡山" },
  { match: "武嶺", displayName: "武嶺" },
  { match: "彩虹眷村", displayName: "彩虹眷村" },
  { match: "宮原眼科", displayName: "宮原眼科" },
  { match: "妖怪村", displayName: "妖怪村" },
  { match: "蘭陽博物館", displayName: "蘭陽博物館" },
  { match: "奇美博物館", displayName: "奇美博物館" },
  { match: "赤崁樓", displayName: "赤崁樓" },
  { match: "安平古堡", displayName: "安平古堡" },
  { match: "煙波大飯店台南館", displayName: "煙波大飯店台南館" },
  { match: "台南煙波大飯店", displayName: "煙波大飯店台南館" },
  { match: "司法博物館", displayName: "司法博物館" },
  { match: "台南市美術館", displayName: "台南市美術館" },
  { match: "台南美術館", displayName: "台南市美術館" },
  { match: "林百貨", displayName: "林百貨" },
  { match: "度小月擔仔麵", displayName: "度小月擔仔麵 中正旗艦店" },
  { match: "度小月担仔面", displayName: "度小月擔仔麵 中正旗艦店" },
  { match: "四草綠色隧道", displayName: "四草綠色隧道" },
  { match: "井仔腳瓦盤鹽田", displayName: "井仔腳瓦盤鹽田" },
  { match: "奮起湖", displayName: "奮起湖" },
  { match: "隙頂", displayName: "隙頂" },
  { match: "達娜伊谷", displayName: "達娜伊谷" },
  { match: "嘉義市區", displayName: "嘉義市" },
  { match: "嘉義公園", displayName: "嘉義公園" },
  { match: "嘉義", displayName: "嘉義" },
  { match: "Chiayi", displayName: "嘉義" },
  { match: "Alishan", displayName: "阿里山" },
  { match: "Cingjing", displayName: "清境" },
  { match: "Yehliu", displayName: "野柳" },
  { match: "清水寺", displayName: "清水寺" },
  { match: "金閣寺", displayName: "金閣寺" },
  { match: "伏見稻荷大社", displayName: "伏見稻荷大社" },
  { match: "伏見稻荷", displayName: "伏見稻荷大社" },
  { match: "嵐山", displayName: "嵐山" },
  { match: "Arashiyama", displayName: "嵐山" },
  { match: "淺草寺", displayName: "淺草寺" },
  { match: "Senso-ji", displayName: "淺草寺" },
  { match: "道頓堀", displayName: "道頓堀" },
  { match: "心齋橋", displayName: "心齋橋" },
  { match: "黑門市場", displayName: "黑門市場" },
  { match: "東京鐵塔", displayName: "東京鐵塔" },
  { match: "東京タワー", displayName: "東京鐵塔" },
  { match: "Tokyo Tower", displayName: "Tokyo Tower" },
  { match: "晴空塔", displayName: "東京晴空塔" },
  { match: "東京晴空塔", displayName: "東京晴空塔" },
  { match: "Skytree", displayName: "東京晴空塔" },
];

const TITLE_POI_LEXICON_SORTED = [...TITLE_POI_LEXICON].sort(
  (a, b) => b.match.length - a.match.length,
);

function normalizeTitleForPoiMatch(text: string): string {
  return text.replace(/臺/g, "台").toLowerCase();
}

/**
 * 從影片標題比對已知實際景點／商圈關鍵詞（與逐字稿抽取互補）。
 */
export function extractAttractionNamesFromVideoTitle(title: string): string[] {
  const raw = title.trim();
  if (raw.length < 2) {
    return [];
  }
  const norm = normalizeTitleForPoiMatch(raw);
  const seenNorm = new Set<string>();
  const out: string[] = [];

  for (const { match, displayName } of TITLE_POI_LEXICON_SORTED) {
    const m = normalizeTitleForPoiMatch(match);
    if (m.length < 2) {
      continue;
    }
    if (!norm.includes(m)) {
      continue;
    }
    const key = normalizeToken(displayName);
    if (seenNorm.has(key)) {
      continue;
    }
    seenNorm.add(key);
    out.push(displayName);
  }

  return out;
}

const PLACE_SUFFIX_PATTERN =
  /\b(Tower|Temple|Shrine|Market|Crossing|Station|Castle|Park|Museum|Garden|Palace|Bridge|District|Street|Skytree|Airport)\b/i;

const GENERIC_BLOCKLIST = new Set([
  "travel",
  "trip",
  "japan",
  "japanese",
  "tokyo travel",
  "osaka travel",
  "kyoto travel",
  "city",
  "downtown",
  "restaurant",
  "breakfast",
  "lunch",
  "dinner",
  "hotel",
  "station area",
  "market area",
  "food",
  "shopping",
  "nightlife",
  "itinerary",
  "day trip",
  "guide",
  "vlog",
  "tour",
  "台灣",
  "臺灣",
  "北部",
  "中部",
  "南部",
  "東部",
  "嘉義",
  "嘉義市",
  "嘉義縣",
  "台北",
  "台北市",
  "臺北",
  "臺北市",
  "新北",
  "新北市",
  "台中",
  "台中市",
  "臺中",
  "臺中市",
  "台南",
  "台南市",
  "臺南",
  "臺南市",
  "高雄",
  "高雄市",
  "桃園",
  "桃園市",
  "日本",
  "韓國",
  "大阪",
  "東京",
]);

const GENERIC_LOCATION_PATTERNS = [
  /^(台灣|臺灣|日本|韓國|北部|中部|南部|東部)$/,
  /^(嘉義|台北|臺北|新北|桃園|台中|臺中|台南|臺南|高雄)(市|縣)?$/,
  /^(大阪|東京|京都|首爾)$/,
  /^(嘉義|台北|臺北|新北|桃園|台中|臺中|台南|臺南|高雄).*(美食|景點|旅遊|懶人包|攻略|自由行|一日遊|兩天一夜|三日遊)$/,
  /^(.*)(美食|景點|旅遊|懶人包|攻略|自由行|行程|推薦)$/,
];

/** 關東／關西等地區粗分，用於「東京影片卻抽到京都」等跨區降分。 */
const KANTO_PLACE_TOKENS = [
  "tokyo",
  "shibuya",
  "shinjuku",
  "asakusa",
  "ginza",
  "harajuku",
  "akihabara",
  "ueno",
  "odaiba",
  "roppongi",
  "tsukiji",
  "skytree",
  "yokohama",
  "chiba",
  "東京",
  "新宿",
  "澀谷",
  "渋谷",
  "淺草",
  "浅草",
  "銀座",
  "原宿",
  "秋葉原",
  "台場",
];

const KANSAI_PLACE_TOKENS = [
  "kyoto",
  "osaka",
  "nara",
  "kobe",
  "dotonbori",
  "umeda",
  "arashiyama",
  "fushimi",
  "京都",
  "大阪",
  "奈良",
  "神戶",
  "神戸",
  "嵐山",
];

function normalizeToken(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCasePreserve(value: string): string {
  return value
    .split(/\s+/)
    .map((word) => {
      if (!word) {
        return word;
      }
      if (/^[A-Z]{2,}$/.test(word)) {
        return word;
      }
      return word[0].toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ");
}

function isLikelyGenericPhrase(value: string): boolean {
  const normalized = normalizeToken(value);
  if (!normalized || GENERIC_BLOCKLIST.has(normalized)) {
    return true;
  }
  if (
    /^(the|this|that|these|those|when|what|where|why|how|we|you|they|it)\b/i.test(value)
  ) {
    return true;
  }
  return false;
}

export function isGenericDestinationName(name: string, destinationHint?: string): boolean {
  const normalized = name.replace(/\s+/g, "").replace(/臺/g, "台").trim();
  const destination = (destinationHint || "").replace(/\s+/g, "").replace(/臺/g, "台").trim();
  if (!normalized) {
    return true;
  }
  if (destination && normalized === destination) {
    return true;
  }
  return GENERIC_LOCATION_PATTERNS.some((pattern) => pattern.test(normalized));
}

function isMalformedPlaceName(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  if (/jquery|selection|document|window|function|undefined|null/.test(normalized)) {
    return true;
  }
  if (/[{}<>[\]#$]/.test(normalized)) {
    return true;
  }
  // Reject OCR/model artifacts such as "台n南" while keeping normal romanized names.
  return /[\u3400-\u9fff][a-z][\u3400-\u9fff]/i.test(value);
}

function stripChinesePoiPrefix(value: string): string {
  return value
    .replace(
      /^(第一站|第二站|第三站|第四站|第五站|接著|接下來|然後|午餐|晚餐|早餐|傍晚|晚上|最後|最後再|今天|這次)?(是|到|來到|走到|去|再去|吃|看|逛|找|介紹)?/,
      "",
    )
    .trim();
}

function hasPlaceSignal(value: string): boolean {
  const normalized = normalizeToken(value);
  return Boolean(ALIAS[normalized]) || PLACE_SUFFIX_PATTERN.test(value);
}

function inferPlaceRegionLabel(name: string): "kanto" | "kansai" | null {
  const n = normalizeToken(name);
  const inKanto = KANTO_PLACE_TOKENS.some((t) => n.includes(normalizeToken(t)));
  const inKansai = KANSAI_PLACE_TOKENS.some((t) => n.includes(normalizeToken(t)));
  if (inKanto && !inKansai) {
    return "kanto";
  }
  if (inKansai && !inKanto) {
    return "kansai";
  }
  if (inKanto && inKansai) {
    return null;
  }
  return null;
}

function countPhraseOccurrences(haystack: string, phrase: string): number {
  const p = phrase.trim();
  if (p.length < 2) {
    return 0;
  }
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matches = haystack.match(new RegExp(escaped, "gi"));
  return matches ? matches.length : 0;
}

/**
 * 目的地（例如東京）與候選（例如京都）分屬不同區域時，依逐字稿證據強度給 0–1 乘數。
 */
export function destinationConflictMultiplier(input: {
  destinationHint?: string;
  candidateDisplayName: string;
  transcriptBlob: string;
  llmHit: boolean;
}): number {
  const destRegion = inferPlaceRegionLabel(input.destinationHint || "");
  const candRegion = inferPlaceRegionLabel(input.candidateDisplayName);
  if (!destRegion || !candRegion || destRegion === candRegion) {
    return 1;
  }

  const occ = countPhraseOccurrences(
    input.transcriptBlob,
    input.candidateDisplayName,
  );
  if (input.llmHit && occ >= 1) {
    return 0.82;
  }
  if (occ >= 2) {
    return 0.75;
  }
  if (occ === 1) {
    return 0.42;
  }
  return 0.12;
}

/**
 * Heuristic extraction of place-like phrases from free text.
 */
export function extractPlaceCandidates(text: string): string[] {
  const cleaned = text.replace(/\[[^\]]*\]/g, " ").replace(/\([^)]*\)/g, " ");
  const candidates = new Set<string>();

  const quoted = cleaned.match(/"([^"]{2,80})"|'([^']{2,80})'/g);
  if (quoted) {
    for (const q of quoted) {
      const inner = q.replace(/^["']|["']$/g, "").trim();
      if (inner.length > 2 && !isLikelyGenericPhrase(inner)) {
        candidates.add(inner);
      }
    }
  }

  const capitalizedPhrase = cleaned.match(
    /\b(?:[A-Z][a-z]+(?:[-'][A-Za-z]+)?(?:\s+[A-Z][a-z]+(?:[-'][A-Za-z]+)?){0,3})\b/g,
  );
  if (capitalizedPhrase) {
    for (const phrase of capitalizedPhrase) {
      const p = phrase.trim();
      if (
        p.length > 3 &&
        p.length < 80 &&
        !isLikelyGenericPhrase(p) &&
        (hasPlaceSignal(p) || p.split(/\s+/).length >= 2)
      ) {
        candidates.add(p);
      }
    }
  }

  const stationHints = cleaned.match(/\b[\w\s]+(?:Station|St\.|JR)\b/gi);
  if (stationHints) {
    for (const h of stationHints) {
      const p = h.trim();
      if (p.length > 3 && p.length < 80 && !isLikelyGenericPhrase(p)) {
        candidates.add(p);
      }
    }
  }

  const chinesePoiHints = cleaned.match(
    /[\u3400-\u9fffA-Za-z0-9・]{2,24}(?:火雞肉飯|砂鍋魚頭|雞肉飯|牛肉湯|豆花|米糕|肉圓|夜市|市場|老街|商圈|公園|博物館|美術館|神社|寺|廟|宮|樓|塔|車站|咖啡|咖啡店|餐廳|飯店|酒店|小吃|冰店|甜品店|茶屋|拉麵|壽司|食堂|景觀台|步道|農場|漁港|碼頭|溫泉|瀑布|湖|山|書店|百貨)/g,
  );
  if (chinesePoiHints) {
    for (const hint of chinesePoiHints) {
      const p = stripChinesePoiPrefix(hint.trim());
      if (p.length >= 3 && p.length <= 28 && !isGenericDestinationName(p)) {
        candidates.add(p);
      }
    }
  }

  return Array.from(candidates);
}

export function normalizePlaceName(raw: string): PlaceNameExtraction {
  const trimmed = raw.trim();
  const normalized = normalizeToken(trimmed);
  const aliasHit = ALIAS[normalized];
  const displayName = aliasHit || titleCasePreserve(trimmed);
  return {
    raw: trimmed,
    normalized,
    displayName,
  };
}

export function mergeAndDedupeExtractions(names: string[], destinationHint?: string): PlaceNameExtraction[] {
  const merged = [...names];
  const seen = new Set<string>();
  const out: PlaceNameExtraction[] = [];

  for (const name of merged) {
    const n = normalizePlaceName(name);
    if (!n.displayName || n.displayName.length < 2 || isGenericDestinationName(n.displayName, destinationHint)) {
      continue;
    }
    if (seen.has(n.normalized)) {
      continue;
    }
    seen.add(n.normalized);
    out.push(n);
  }

  return out.slice(0, 24);
}

export function extractPlacesFromTranscriptAndSummary(input: {
  summary: string;
  segmentTexts: string[];
  transcriptTexts: string[];
  llmLocationNames: string[];
  destinationHint?: string;
  /** 影片標題：用於比對實際景點關鍵詞。 */
  videoTitle?: string;
}): PlaceCandidate[] {
  const titleDerived = extractAttractionNamesFromVideoTitle(input.videoTitle || "");
  const titleNormSet = new Set(titleDerived.map((n) => normalizeToken(n)));

  const blob = [input.summary, ...input.segmentTexts, ...input.transcriptTexts].join("\n");
  const heuristic = mergeAndDedupeExtractions([
    ...extractPlaceCandidates(input.summary),
    ...input.segmentTexts.flatMap((segment) => extractPlaceCandidates(segment)),
    ...input.transcriptTexts.flatMap((segment) => extractPlaceCandidates(segment)),
  ]).map((entry) => entry.displayName);
  const candidates = mergeAndDedupeExtractions([
    ...titleDerived,
    ...input.llmLocationNames,
    ...heuristic,
  ], input.destinationHint);
  const destinationNormalized = normalizeToken(input.destinationHint || "");

  const scored = candidates
    .map((candidate) => {
      const normalized = candidate.normalized;
      const titlePoiHit = titleNormSet.has(normalized);
      const llmHit = input.llmLocationNames.some(
        (name) => normalizeToken(name) === normalized,
      );
      const segmentOccurrenceCount = input.segmentTexts.filter((segment) =>
        segment.toLowerCase().includes(candidate.displayName.toLowerCase()),
      ).length;
      const transcriptOccurrenceCount = input.transcriptTexts.filter((segment) =>
        segment.toLowerCase().includes(candidate.displayName.toLowerCase()),
      ).length;
      const summaryHit = input.summary.toLowerCase().includes(candidate.displayName.toLowerCase());
      const patternScore =
        (titlePoiHit ? 6 : 0) +
        (llmHit ? 3 : 0) +
        (Boolean(ALIAS[normalized]) ? 3 : 0) +
        (hasPlaceSignal(candidate.displayName) ? 2 : 0) +
        (summaryHit ? 2 : 0) +
        (segmentOccurrenceCount > 0 ? 2 : 0) +
        (transcriptOccurrenceCount > 0 ? 2 : 0) +
        (segmentOccurrenceCount + transcriptOccurrenceCount > 1 ? 1 : 0) +
        (candidate.displayName.split(/\s+/).length >= 2 ? 1 : 0);

      const source: PlaceCandidate["source"] = titlePoiHit
        ? "title-poi"
        : llmHit
          ? "llm"
          : "heuristic";
      const regionMult = destinationConflictMultiplier({
        destinationHint: input.destinationHint,
        candidateDisplayName: candidate.displayName,
        transcriptBlob: blob,
        llmHit,
      });
      const rerankScore = patternScore * regionMult;

      return {
        extraction: candidate,
        source,
        patternScore,
        rerankScore,
      };
    })
    .filter(({ extraction, patternScore }) => {
      if (isLikelyGenericPhrase(extraction.displayName) || isMalformedPlaceName(extraction.displayName)) {
        return false;
      }
      if (destinationNormalized && extraction.normalized === destinationNormalized) {
        return false;
      }
      if (isGenericDestinationName(extraction.displayName, input.destinationHint)) {
        return false;
      }
      return patternScore >= 2;
    })
    .sort((left, right) => right.rerankScore - left.rerankScore);

  return scored.slice(0, 16);
}

/**
 * When Google geocoding is unavailable, map names to catalog coordinates (explicit fallback).
 */
export function catalogFallbackLocations(
  places: PlaceNameExtraction[],
  destinationHint?: string,
) {
  return places.map((p) => resolveLocationReference(p.displayName, destinationHint, `Approximate position for ${p.displayName}.`));
}
