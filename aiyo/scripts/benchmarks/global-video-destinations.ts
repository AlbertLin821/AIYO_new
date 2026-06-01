/**
 * 全球熱門目的地基準清單（26），供 benchmark-global-video-destinations 腳本使用。
 */

export type CountryBounds = {
  latMin: number;
  latMax: number;
  lngMin: number;
  lngMax: number;
};

export type AnchorPoi = {
  name: string;
  lat: number;
  lng: number;
  /** 若 geocode 結果距離錨點超過此公里數，標記 anchorMiss（弱檢查） */
  maxKm: number;
};

export type GlobalVideoDestination = {
  id: string;
  destinationHint: string;
  searchKeyword: string;
  region: string;
  genericRejectHints: string[];
  expectedCountryBounds: CountryBounds;
  anchorPois?: AnchorPoi[];
};

const COMMON_GENERIC_REJECT = [
  "美食",
  "小吃",
  "景點",
  "旅遊",
  "自由行",
  "攻略",
  "市區",
  "附近",
  "市中心",
  "必吃",
  "必去",
  "一日遊",
  "兩天一夜",
  "三天兩夜",
] as const;

function dest(
  entry: Omit<GlobalVideoDestination, "genericRejectHints"> & { extraGeneric?: string[] },
): GlobalVideoDestination {
  return {
    ...entry,
    genericRejectHints: [
      entry.destinationHint,
      ...COMMON_GENERIC_REJECT,
      ...(entry.extraGeneric ?? []),
    ],
  };
}

export const GLOBAL_VIDEO_DESTINATIONS: GlobalVideoDestination[] = [
  dest({
    id: "tokyo",
    destinationHint: "東京",
    searchKeyword: "東京自由行 淺草寺 晴空塔 澀谷 美食",
    region: "東北亞",
    expectedCountryBounds: { latMin: 24, latMax: 46, lngMin: 122, lngMax: 146 },
    extraGeneric: ["日本", "東京都", "關東"],
    anchorPois: [
      { name: "東京鐵塔", lat: 35.6586, lng: 139.7454, maxKm: 80 },
      { name: "淺草寺", lat: 35.7148, lng: 139.7967, maxKm: 80 },
    ],
  }),
  dest({
    id: "osaka",
    destinationHint: "大阪",
    searchKeyword: "大阪自由行 道頓堀 大阪城 美食",
    region: "東北亞",
    expectedCountryBounds: { latMin: 24, latMax: 46, lngMin: 122, lngMax: 146 },
    extraGeneric: ["日本", "大阪府", "關西"],
    anchorPois: [
      { name: "道頓堀", lat: 34.6687, lng: 135.5019, maxKm: 80 },
      { name: "大阪城", lat: 34.6873, lng: 135.5262, maxKm: 80 },
    ],
  }),
  dest({
    id: "kyoto",
    destinationHint: "京都",
    searchKeyword: "京都自由行 清水寺 伏見稻荷 嵐山",
    region: "東北亞",
    expectedCountryBounds: { latMin: 24, latMax: 46, lngMin: 122, lngMax: 146 },
    extraGeneric: ["日本", "京都府", "關西"],
    anchorPois: [{ name: "清水寺", lat: 34.9949, lng: 135.785, maxKm: 60 }],
  }),
  dest({
    id: "seoul",
    destinationHint: "首爾",
    searchKeyword: "首爾自由行 景福宮 明洞 弘大",
    region: "東北亞",
    expectedCountryBounds: { latMin: 33, latMax: 39, lngMin: 124, lngMax: 132 },
    extraGeneric: ["韓國", "南韓", "首爾特別市"],
    anchorPois: [{ name: "景福宮", lat: 37.5796, lng: 126.977, maxKm: 80 }],
  }),
  dest({
    id: "bangkok",
    destinationHint: "曼谷",
    searchKeyword: "曼谷自由行 大皇宮 洽圖洽週末市場",
    region: "東南亞",
    expectedCountryBounds: { latMin: 5, latMax: 21, lngMin: 97, lngMax: 106 },
    extraGeneric: ["泰國", "曼谷市"],
  }),
  dest({
    id: "singapore",
    destinationHint: "新加坡",
    searchKeyword: "新加坡自由行 魚尾獅 濱海灣 美食",
    region: "東南亞",
    expectedCountryBounds: { latMin: 1.1, latMax: 1.5, lngMin: 103.6, lngMax: 104.1 },
    extraGeneric: ["新加坡", "獅城"],
    anchorPois: [{ name: "魚尾獅公園", lat: 1.2868, lng: 103.8545, maxKm: 40 }],
  }),
  dest({
    id: "hanoi",
    destinationHint: "河內",
    searchKeyword: "河內自由行 還劍湖 三十六古街",
    region: "東南亞",
    expectedCountryBounds: { latMin: 8, latMax: 24, lngMin: 102, lngMax: 110 },
    extraGeneric: ["越南", "河內市"],
  }),
  dest({
    id: "ho-chi-minh",
    destinationHint: "胡志明市",
    searchKeyword: "胡志明自由行 第一郡 咖啡公寓",
    region: "東南亞",
    expectedCountryBounds: { latMin: 8, latMax: 24, lngMin: 102, lngMax: 110 },
    extraGeneric: ["越南", "胡志明", "西貢"],
  }),
  dest({
    id: "kuala-lumpur",
    destinationHint: "吉隆坡",
    searchKeyword: "吉隆坡自由行 雙子星塔 獨立廣場",
    region: "東南亞",
    expectedCountryBounds: { latMin: 0.8, latMax: 7.5, lngMin: 99, lngMax: 120 },
    extraGeneric: ["馬來西亞", "吉隆坡市"],
    anchorPois: [{ name: "雙子星塔", lat: 3.1579, lng: 101.7116, maxKm: 60 }],
  }),
  dest({
    id: "bali",
    destinationHint: "峇里島",
    searchKeyword: "峇里島自由行 烏布 海神廟 美食",
    region: "東南亞",
    expectedCountryBounds: { latMin: -11, latMax: 6, lngMin: 94, lngMax: 141 },
    extraGeneric: ["印尼", "巴厘島", "巴厘岛"],
  }),
  dest({
    id: "taipei",
    destinationHint: "台北",
    searchKeyword: "台北自由行 台北101 九份 美食",
    region: "華語區",
    expectedCountryBounds: { latMin: 21.5, latMax: 25.5, lngMin: 119.5, lngMax: 122.5 },
    extraGeneric: ["台灣", "臺灣", "台北市", "臺北市", "新北"],
    anchorPois: [{ name: "台北101", lat: 25.034, lng: 121.5645, maxKm: 80 }],
  }),
  dest({
    id: "hong-kong",
    destinationHint: "香港",
    searchKeyword: "香港自由行 太平山 維多利亞港 美食",
    region: "華語區",
    expectedCountryBounds: { latMin: 22.1, latMax: 22.6, lngMin: 113.8, lngMax: 114.5 },
    extraGeneric: ["香港", "港島", "九龍"],
  }),
  dest({
    id: "macau",
    destinationHint: "澳門",
    searchKeyword: "澳門自由行 大三巴 官也街 美食",
    region: "華語區",
    expectedCountryBounds: { latMin: 22.1, latMax: 22.25, lngMin: 113.5, lngMax: 113.65 },
    extraGeneric: ["澳門", "澳门", "氹仔"],
  }),
  dest({
    id: "chiayi",
    destinationHint: "嘉義市",
    searchKeyword: "嘉義兩天一夜 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯",
    region: "華語區",
    expectedCountryBounds: { latMin: 21.5, latMax: 25.5, lngMin: 119.5, lngMax: 122.5 },
    extraGeneric: ["嘉義", "嘉義縣", "嘉義美食", "嘉義景點", "嘉義旅遊", "嘉義兩天一夜"],
  }),
  dest({
    id: "paris",
    destinationHint: "巴黎",
    searchKeyword: "巴黎自由行 艾菲爾鐵塔 羅浮宮",
    region: "歐洲",
    expectedCountryBounds: { latMin: 41, latMax: 51.5, lngMin: -5.5, lngMax: 10 },
    extraGeneric: ["法國", "巴黎市"],
    anchorPois: [{ name: "艾菲爾鐵塔", lat: 48.8584, lng: 2.2945, maxKm: 80 }],
  }),
  dest({
    id: "rome",
    destinationHint: "羅馬",
    searchKeyword: "羅馬自由行 競技場 許願池",
    region: "歐洲",
    expectedCountryBounds: { latMin: 36, latMax: 47.5, lngMin: 6, lngMax: 19 },
    extraGeneric: ["義大利", "意大利", "羅馬市"],
    anchorPois: [{ name: "羅馬競技場", lat: 41.8902, lng: 12.4922, maxKm: 80 }],
  }),
  dest({
    id: "london",
    destinationHint: "倫敦",
    searchKeyword: "倫敦自由行 大英博物館 倫敦眼",
    region: "歐洲",
    expectedCountryBounds: { latMin: 49.5, latMax: 61, lngMin: -8.5, lngMax: 2.5 },
    extraGeneric: ["英國", "倫敦市"],
    anchorPois: [{ name: "倫敦眼", lat: 51.5033, lng: -0.1196, maxKm: 80 }],
  }),
  dest({
    id: "barcelona",
    destinationHint: "巴塞隆納",
    searchKeyword: "巴塞隆納自由行 聖家堂 蘭布拉大道",
    region: "歐洲",
    expectedCountryBounds: { latMin: 36, latMax: 44, lngMin: -10, lngMax: 5 },
    extraGeneric: ["西班牙", "巴塞隆納市", "巴塞罗那"],
    anchorPois: [{ name: "聖家堂", lat: 41.4036, lng: 2.1744, maxKm: 60 }],
  }),
  dest({
    id: "santorini",
    destinationHint: "聖托里尼",
    searchKeyword: "聖托里尼自由行 伊亞 藍頂教堂",
    region: "歐洲",
    expectedCountryBounds: { latMin: 34.5, latMax: 42, lngMin: 19, lngMax: 30 },
    extraGeneric: ["希臘", "希腊", "愛琴海"],
  }),
  dest({
    id: "istanbul",
    destinationHint: "伊斯坦堡",
    searchKeyword: "伊斯坦堡自由行 聖索菲亞 大巴扎",
    region: "歐洲",
    expectedCountryBounds: { latMin: 36, latMax: 42, lngMin: 26, lngMax: 45 },
    extraGeneric: ["土耳其", "伊斯坦堡市"],
    anchorPois: [{ name: "聖索菲亞大教堂", lat: 41.0086, lng: 28.98, maxKm: 80 }],
  }),
  dest({
    id: "new-york",
    destinationHint: "紐約",
    searchKeyword: "紐約自由行 自由女神 時代廣場",
    region: "美洲",
    expectedCountryBounds: { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 },
    extraGeneric: ["美國", "纽约", "紐約市"],
    anchorPois: [{ name: "自由女神", lat: 40.6892, lng: -74.0445, maxKm: 120 }],
  }),
  dest({
    id: "los-angeles",
    destinationHint: "洛杉磯",
    searchKeyword: "洛杉磯自由行 好萊塢 聖莫尼卡",
    region: "美洲",
    expectedCountryBounds: { latMin: 24, latMax: 50, lngMin: -125, lngMax: -66 },
    extraGeneric: ["美國", "洛杉矶", "洛杉磯市", "LA"],
  }),
  dest({
    id: "sydney",
    destinationHint: "雪梨",
    searchKeyword: "雪梨自由行 雪梨歌劇院 邦迪海灘",
    region: "大洋洲",
    expectedCountryBounds: { latMin: -44, latMax: -10, lngMin: 112, lngMax: 154 },
    extraGeneric: ["澳洲", "澳大利亚", "雪梨市", "悉尼"],
    anchorPois: [{ name: "雪梨歌劇院", lat: -33.8568, lng: 151.2153, maxKm: 80 }],
  }),
  dest({
    id: "dubai",
    destinationHint: "杜拜",
    searchKeyword: "杜拜自由行 哈里發塔 杜拜商城",
    region: "中東",
    expectedCountryBounds: { latMin: 22.5, latMax: 26.5, lngMin: 51, lngMax: 56.5 },
    extraGeneric: ["阿聯酋", "阿联酋", "杜拜市"],
    anchorPois: [{ name: "哈里發塔", lat: 25.1972, lng: 55.2744, maxKm: 80 }],
  }),
  dest({
    id: "reykjavik",
    destinationHint: "雷克雅維克",
    searchKeyword: "冰島自由行 藍湖 黃金圈",
    region: "北歐",
    expectedCountryBounds: { latMin: 63, latMax: 67, lngMin: -25, lngMax: -13 },
    extraGeneric: ["冰島", "冰岛"],
  }),
  dest({
    id: "interlaken",
    destinationHint: "因特拉肯",
    searchKeyword: "瑞士因特拉肯 少女峰 一日遊",
    region: "阿爾卑斯",
    expectedCountryBounds: { latMin: 45.5, latMax: 48, lngMin: 5.5, lngMax: 11 },
    extraGeneric: ["瑞士", "瑞士旅遊"],
    anchorPois: [{ name: "少女峰", lat: 46.5476, lng: 7.9851, maxKm: 120 }],
  }),
];

/** 預載種子用的 20 個目的地 id（與搜尋欄／行程目的地對齊）。 */
export const TOP_20_DESTINATION_IDS = [
  "tokyo",
  "osaka",
  "kyoto",
  "seoul",
  "bangkok",
  "singapore",
  "hanoi",
  "ho-chi-minh",
  "kuala-lumpur",
  "bali",
  "taipei",
  "hong-kong",
  "macau",
  "paris",
  "rome",
  "london",
  "barcelona",
  "new-york",
  "sydney",
  "dubai",
] as const;

export function getTop20GlobalVideoDestinations(): GlobalVideoDestination[] {
  const byId = new Map(GLOBAL_VIDEO_DESTINATIONS.map((d) => [d.id, d]));
  return TOP_20_DESTINATION_IDS.map((id) => byId.get(id)).filter(
    (d): d is GlobalVideoDestination => Boolean(d),
  );
}

export function getDestinationById(id: string): GlobalVideoDestination | undefined {
  const normalized = id.trim().toLowerCase();
  return GLOBAL_VIDEO_DESTINATIONS.find(
    (d) => d.id === normalized || d.destinationHint === id || d.id === id,
  );
}

export function filterDestinations(only?: string[]): GlobalVideoDestination[] {
  if (!only?.length) {
    return GLOBAL_VIDEO_DESTINATIONS;
  }
  const tokens = only.map((t) => t.trim().toLowerCase()).filter(Boolean);
  return GLOBAL_VIDEO_DESTINATIONS.filter((d) =>
    tokens.some(
      (t) =>
        d.id === t ||
        d.destinationHint.toLowerCase() === t ||
        d.destinationHint.includes(t) ||
        t.includes(d.id),
    ),
  );
}
