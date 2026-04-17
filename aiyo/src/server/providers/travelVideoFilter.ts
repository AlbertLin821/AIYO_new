/**
 * 搜尋欄以地名／關鍵字找片：優先「旅遊」且「與輸入地名／地方相關」。
 */

/** 置於使用者關鍵字之後，加強旅遊意圖（勿過長以免稀釋地名）。 */
const TRAVEL_QUERY_SUFFIX =
  "旅遊 travel vlog trip tour 觀光 自由行 行程 景點 攻略";

/** 從「地名條件」抽離的泛旅遊詞（不當作必須出現在影片內的地名）。 */
const TRAVEL_FILLER_TOKENS = new Set([
  "旅遊",
  "旅行",
  "觀光",
  "自由行",
  "攻略",
  "行程",
  "景點",
  "推薦",
  "必去",
  "住宿",
  "交通",
  "travel",
  "trip",
  "tours",
  "tour",
  "vlog",
  "guide",
  "itinerary",
  "visit",
  "tourism",
]);

/** 常見地名與英文／假名對照（影片標題常僅寫 Tokyo／Kyoto）。 */
const PLACE_ALIASES: Record<string, string[]> = {
  東京: ["tokyo", "とうきょう", "toukyou"],
  大阪: ["osaka", "おおさか"],
  京都: ["kyoto", "きょうと"],
  北海道: ["hokkaido", "ほっかいどう"],
  沖繩: ["okinawa", "沖縄", "おきなわ"],
  福岡: ["fukuoka", "ふくおか"],
  名古屋: ["nagoya", "なごや"],
  札幌: ["sapporo", "さっぽろ"],
  仙台: ["sendai", "せんだい"],
  廣島: ["hiroshima", "ひろしま"],
  台灣: ["taiwan", "台湾", "臺灣", "台灣"],
  臺北: ["taipei", "台北", "台灣台北"],
  台北: ["taipei", "臺北"],
  高雄: ["kaohsiung", "たかお"],
  台中: ["taichung", "たいちゅう"],
  台南: ["tainan", "たいなん"],
  花蓮: ["hualien", "花蓮"],
  台東: ["taitung", "臺東", "台東市"],
  宜蘭: ["yilan", "宜蘭縣", "ilan"],
  澎湖: ["penghu", "澎湖縣"],
  墾丁: ["kenting", "kending", "恆春"],
  清境: ["cingjing", "清境農場", "qingjing"],
  日月潭: ["sun moon lake", "日月潭"],
  阿里山: ["alishan", "阿里山"],
  九份: ["jiufen", "九份"],
  綠島: ["green island", "綠島", "lvdao"],
  蘭嶼: ["orchid island", "蘭嶼", "lanyu"],
  馬祖: ["matsu", "馬祖"],
  金門: ["kinmen", "金門"],
  嘉義: ["chiayi", "chiayi city", "嘉義市", "嘉義縣"],
  首爾: ["seoul", "ソウル", "서울"],
  釜山: ["busan", "ふさん"],
};

/** 標題若強烈像新聞／時事，直接排除。 */
const TITLE_HARD_EXCLUDE =
  /新聞|時事|快訊|突發|直播\s*[\u4e00-\u9fff]?新聞|Breaking\s*News|breaking\s*news|\bLIVE\s*NEWS\b|\bCNN\b|\bBBC\s*News\b|路透社|中央社|聯合報|自由時報|體育快訊|股市|匯市|軍事|戰爭|選舉|議會/;

const BODY_STRONG_EXCLUDE =
  /訂閱.*新聞|news\s*anchor|記者會|發言人|外交部記者|press\s*conference/i;

const TRAVEL_POSITIVE =
  /travel|tourism|tourist|sightseeing|\bvlog\b|VLOG|trip\b|tour\b|itinerary|backpack|wanderlust|vacation\s+in|holiday\s+in|旅遊|觀光|自由行|旅行|遊記|行程|攻略|景點|懶人包|必去|打卡|開箱|走訪|一日遊|二日遊|三日遊|多日遊|兩天一夜|三天兩夜|五天四夜|住宿|飯店|民宿|hotel|hostel|一人旅|観光|旅行記|travel\s*guide|food\s*tour|walking\s*tour|おすすめ|スポット|宿泊|ホテル|鉄道|電車|鉄道旅/i;

/** 與「出遊體驗」相關的美食／探店／在地體驗（單獨即可通過，不必再配 遊／玩）。 */
const FOOD_AND_PLACE_EXPERIENCE =
  /美食|必吃|餐廳|咖啡廳|咖啡館|甜點|小吃|探店|米其林|壽司|拉麵|燒肉|早午餐|下午茶|夜市|市場|吃播|吃貨|私房|排隊|人氣店|在地|必去景點|景點介紹|food\s*tour|street\s*food|must\s*eat|restaurant|cafe\b/i;

const LEISURE_PLACE_HINT =
  /美食|餐廳|咖啡|甜點|散步|逛街|購物|夜景|溫泉|神社|寺廟|博物館|樂園|機票|JR|地鐵|交通|路線/i;

function tokenizeQuery(q: string): string[] {
  return q
    .trim()
    .split(/[\s\u3000,，。]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2 && !/^https?:/i.test(s));
}

/**
 * 使用者輸入中，應與影片標題／說明對得上的「核心地名／主題詞」（已去掉泛旅遊填充詞）。
 */
export function getCorePlaceTokens(userQuery: string): string[] {
  return tokenizeQuery(userQuery).filter(
    (t) => !TRAVEL_FILLER_TOKENS.has(t.toLowerCase()),
  );
}

/** 常見異體／新舊字形，避免「臺北」與「台北」對不起來。 */
function normalizePlaceText(s: string): string {
  return s.replace(/臺/g, "台");
}

function haystackIncludesToken(haystack: string, token: string): boolean {
  const normalizedHay = normalizePlaceText(haystack.toLowerCase());
  const t = token.trim();
  if (t.length < 2) {
    return false;
  }
  const nt = normalizePlaceText(t.toLowerCase());
  if (normalizedHay.includes(nt) || haystack.includes(t)) {
    return true;
  }
  const aliases = PLACE_ALIASES[t] || PLACE_ALIASES[t.toLowerCase()];
  if (aliases) {
    return aliases.some(
      (a) =>
        normalizedHay.includes(normalizePlaceText(a.toLowerCase())) ||
        haystack.includes(a),
    );
  }
  return false;
}

/**
 * 影片內文是否涵蓋使用者想找的「地方／關鍵詞」（核心詞須至少命中；多詞則盡量全命中）。
 */
export function hasQueryPlaceRelevance(
  meta: TravelVideoMeta,
  originalQuery: string,
): boolean {
  const raw = originalQuery.trim();
  if (raw.length < 2) {
    return false;
  }

  const title = meta.title || "";
  const description = (meta.description || "").slice(0, 2500);
  const haystack = `${title}\n${description}`;

  const core = getCorePlaceTokens(raw);
  if (core.length === 0) {
    // 僅輸入「旅遊、自由行」等：整段查詢須出現在內文，且仍須通過旅遊訊號（於 isTravelRelatedVideo 內）
    return haystack.includes(raw) || lowerIncludesPhrase(haystack, raw);
  }

  return core.every((token) => haystackIncludesToken(haystack, token));
}

function lowerIncludesPhrase(haystack: string, phrase: string): boolean {
  return haystack.toLowerCase().includes(phrase.toLowerCase());
}

/**
 * 影片推薦 API 的實際搜尋字串：使用者有輸入關鍵字時只採用關鍵字，
 * 避免與個人檔「目的地」合併成「嘉義 Tokyo」等錯誤查詢。
 */
export function buildVideoRecommendationSearchQuery(input: {
  keyword?: string;
  destination?: string;
}): string {
  const kw = input.keyword?.trim() ?? "";
  const dest = input.destination?.trim() ?? "";
  if (kw.length > 0) {
    return kw;
  }
  return dest;
}

/**
 * 在使用者輸入前綴保留「地名優先」，再帶旅遊語意。
 */
export function buildTravelBiasedSearchQuery(userQuery: string): string {
  const base = userQuery.trim();
  if (!base) {
    return TRAVEL_QUERY_SUFFIX;
  }
  return `${base} ${TRAVEL_QUERY_SUFFIX}`.trim();
}

/** 高旅遊意圖查詢（主搜尋流程），以核心地名或首段詞為錨點。 */
export function buildHighIntentSearchQueries(userQuery: string): string[] {
  const raw = userQuery.trim();
  if (!raw) {
    return [];
  }
  const cores = getCorePlaceTokens(raw);
  const firstToken = raw
    .split(/[\s\u3000,，]+/)
    .map((s) => s.trim())
    .filter(Boolean)[0];
  const anchor = (cores[0] || firstToken || raw).trim();
  if (anchor.length < 1) {
    return [];
  }
  return [`${anchor} 旅遊`, `${anchor} 自由行`, `${anchor} 景點`, `${anchor} 攻略`];
}

export type TravelVideoMeta = {
  title: string;
  description: string;
  channelTitle?: string;
};

/**
 * 旅遊或美食／在地體驗相關：觀光行程類、純美食探店、或地名＋休閒脈絡。
 */
function hasTravelOrFoodSignal(combined: string, title: string): boolean {
  if (TRAVEL_POSITIVE.test(combined)) {
    return true;
  }
  if (FOOD_AND_PLACE_EXPERIENCE.test(combined)) {
    return true;
  }
  if (LEISURE_PLACE_HINT.test(combined) && /(遊|玩|走|拍|開箱|紀錄|記錄|逛|吃)/.test(combined)) {
    return true;
  }
  if (/(vlog|紀錄片|紀錄|記錄)/i.test(title)) {
    return true;
  }
  return false;
}

/**
 * 同時要求：與輸入地名／詞相關、且為旅遊向內容。
 */
export function isTravelRelatedVideo(
  meta: TravelVideoMeta,
  originalQuery: string,
): boolean {
  const title = meta.title || "";
  const description = (meta.description || "").slice(0, 2000);
  const channel = meta.channelTitle || "";
  const combined = `${title}\n${description}\n${channel}`;

  if (!hasQueryPlaceRelevance(meta, originalQuery)) {
    return false;
  }

  if (TITLE_HARD_EXCLUDE.test(title)) {
    return false;
  }
  if (channel && /新聞|News\s*Live|時事\s*台|NEWS\s*24|Press\s*TV/i.test(channel)) {
    return false;
  }
  if (BODY_STRONG_EXCLUDE.test(combined)) {
    return false;
  }

  const core = getCorePlaceTokens(originalQuery.trim());
  const travelOk = hasTravelOrFoodSignal(combined, title);
  if (!travelOk) {
    return false;
  }

  // 僅輸入泛旅遊詞、無核心地名時：須整句或強旅遊訊號
  if (core.length === 0) {
    const raw = originalQuery.trim();
    return (
      combined.includes(raw) ||
      lowerIncludesPhrase(combined, raw) ||
      TRAVEL_POSITIVE.test(combined)
    );
  }

  return true;
}

/**
 * 排序：地名在標題命中優先，其次說明命中，其次旅遊詞強度。
 */
export function scoreVideoPlaceTravelRank(
  meta: TravelVideoMeta,
  originalQuery: string,
): number {
  const title = (meta.title || "").toLowerCase();
  const desc = (meta.description || "").slice(0, 800).toLowerCase();
  const core = getCorePlaceTokens(originalQuery.trim());
  let score = 0;

  for (const token of core) {
    const t = token.toLowerCase();
    if (meta.title.includes(token) || title.includes(t)) {
      score += 12;
      continue;
    }
    if (haystackIncludesToken(`${meta.title}\n${meta.description || ""}`, token)) {
      score += 8;
      continue;
    }
    const aliases = PLACE_ALIASES[token] || PLACE_ALIASES[token.toLowerCase()];
    if (aliases?.some((a) => title.includes(a.toLowerCase()))) {
      score += 10;
    }
  }

  const rawTitle = meta.title || "";
  if (
    core.length > 0 &&
    core.some((token) => rawTitle.includes(token)) &&
    /旅遊|景點|自由行|攻略/.test(rawTitle)
  ) {
    score += 8;
  }
  const channelLower = (meta.channelTitle || "").toLowerCase();
  if (/旅遊|旅行|travel|vlog|走跳|玩樂|trip|tour/i.test(channelLower)) {
    score += 3;
  }

  const comb = `${meta.title}\n${meta.description || ""}`;
  if (TRAVEL_POSITIVE.test(comb)) {
    score += 4;
  }
  if (FOOD_AND_PLACE_EXPERIENCE.test(comb)) {
    score += 3;
  }
  if (LEISURE_PLACE_HINT.test(comb)) {
    score += 2;
  }
  return score;
}

/**
 * 寬鬆篩選：僅排除明顯新聞／時事，並要求與查詢地名／關鍵詞有關且不太像純新聞內容。
 * 當嚴格「旅遊＋美食訊號」篩掉所有結果時作為備援，避免搜尋 API 有片卻零筆。
 */
export function isLoosePlaceRelatedVideo(
  meta: TravelVideoMeta,
  originalQuery: string,
): boolean {
  const title = meta.title || "";
  const description = (meta.description || "").slice(0, 2000);
  const channel = meta.channelTitle || "";
  const combined = `${title}\n${description}\n${channel}`;

  if (!hasQueryPlaceRelevance(meta, originalQuery)) {
    return false;
  }
  if (TITLE_HARD_EXCLUDE.test(title)) {
    return false;
  }
  if (channel && /新聞|News\s*Live|時事\s*台|NEWS\s*24|Press\s*TV/i.test(channel)) {
    return false;
  }
  if (BODY_STRONG_EXCLUDE.test(combined)) {
    return false;
  }
  return true;
}

const SEARCH_INTENT_SUFFIXES = [
  "旅遊",
  "景點",
  "美食",
  "自由行",
  "攻略",
  "travel vlog",
];

const LOW_VALUE_PATTERNS = [
  /#shorts/i,
  /\bshorts?\b/i,
  /\bnews\b/i,
  /直播/i,
  /新聞/i,
  /廣告/i,
  /promo/i,
];

export function buildExpandedTravelSearchQueries(userQuery: string): string[] {
  const raw = userQuery.trim();
  if (!raw) {
    return [];
  }

  const anchor = (getCorePlaceTokens(raw)[0] || raw).trim();
  const expanded = SEARCH_INTENT_SUFFIXES.map((suffix) => `${anchor} ${suffix}`.trim());

  return Array.from(
    new Set([
      ...expanded,
      buildTravelBiasedSearchQuery(raw),
      raw,
    ]),
  ).filter(Boolean);
}

export function isLowIntentShortFormVideo(meta: TravelVideoMeta & { durationSeconds?: number | null }): boolean {
  const combined = `${meta.title}\n${meta.description}\n${meta.channelTitle || ""}`;
  if (LOW_VALUE_PATTERNS.some((pattern) => pattern.test(combined))) {
    return true;
  }
  if (typeof meta.durationSeconds === "number" && meta.durationSeconds > 0 && meta.durationSeconds < 120) {
    return true;
  }
  return false;
}

export function scoreSearchResultQuality(
  meta: TravelVideoMeta & {
    durationSeconds?: number | null;
    publishedAt?: string;
    transcriptLikelyAvailable?: boolean;
  },
  originalQuery: string,
): number {
  const combined = `${meta.title}\n${meta.description}\n${meta.channelTitle || ""}`;
  let score = scoreVideoPlaceTravelRank(meta, originalQuery);

  if (isTravelRelatedVideo(meta, originalQuery)) {
    score += 12;
  }
  if (/旅遊|景點|美食|自由行|攻略|vlog|travel|itinerary|food/i.test(meta.title)) {
    score += 8;
  }
  if (/美食|food|cafe|night market|street food/i.test(combined)) {
    score += 3;
  }
  if (/旅遊|travel|trip|vlog|explore|自由行/i.test(meta.channelTitle || "")) {
    score += 4;
  }

  if (typeof meta.durationSeconds === "number") {
    if (meta.durationSeconds >= 6 * 60 && meta.durationSeconds <= 45 * 60) {
      score += 6;
    } else if (meta.durationSeconds >= 2 * 60) {
      score += 2;
    } else {
      score -= 12;
    }
  }

  if (meta.transcriptLikelyAvailable) {
    score += 4;
  }

  if (meta.publishedAt) {
    const publishedAtMs = Date.parse(meta.publishedAt);
    if (Number.isFinite(publishedAtMs)) {
      const ageDays = Math.max(0, (Date.now() - publishedAtMs) / 86_400_000);
      if (ageDays <= 365) {
        score += 8;
      } else if (ageDays <= 365 * 2) {
        score += 5;
      } else if (ageDays <= 365 * 4) {
        score += 2;
      } else if (ageDays > 365 * 6) {
        score -= 4;
      }
    }
  }

  if (isLowIntentShortFormVideo(meta)) {
    score -= 18;
  }
  if (/news|新聞|直播|廣告|promo|press/i.test(combined)) {
    score -= 16;
  }

  return score;
}
