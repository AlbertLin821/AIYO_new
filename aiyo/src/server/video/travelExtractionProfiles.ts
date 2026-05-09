export type TravelExtractionProfile = {
  id: string;
  country: string;
  supportedLanguages: string[];
  genericLocationNames: string[];
  genericTravelTerms: string[];
  placeSuffixes: string[];
  foodTerms: string[];
  fillerPrefixes: string[];
  poiPatterns: RegExp[];
};

const COMMON_GENERIC_TRAVEL_TERMS = [
  "travel",
  "food",
  "guide",
  "itinerary",
  "city center",
  "downtown",
  "美食",
  "景點",
  "小吃",
  "旅遊",
  "行程",
  "攻略",
  "市區",
  "附近",
  "必吃",
  "必去",
];

const COMMON_FILLERS = [
  "today we are",
  "we are now at",
  "right now we are",
  "next we are going to",
  "this place is",
  "let me show you",
  "here you can see",
  "哈囉大家好",
  "今天我們要",
  "我們現在來到",
  "接下來",
  "然後",
  "好那",
  "這邊可以看到",
  "這間就是",
  "這家就是",
  "下一站",
  "我們要去",
  "やってきました",
  "こちらは",
  "次は",
  "今日は",
  "見てください",
  "여기는",
  "다음은",
  "오늘은",
  "지금",
  "보시면",
];

export const taiwanProfile: TravelExtractionProfile = {
  id: "taiwan",
  country: "Taiwan",
  supportedLanguages: ["zh-TW", "zh-Hant", "en"],
  genericLocationNames: [
    "台灣",
    "臺灣",
    "北部",
    "中部",
    "南部",
    "東部",
    "台北",
    "台北市",
    "臺北",
    "臺北市",
    "新北",
    "新北市",
    "桃園",
    "桃園市",
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
    "嘉義",
    "嘉義市",
    "嘉義縣",
  ],
  genericTravelTerms: [...COMMON_GENERIC_TRAVEL_TERMS],
  placeSuffixes: [
    "夜市",
    "市場",
    "老街",
    "公園",
    "博物館",
    "美術館",
    "車站",
    "火車站",
    "宮",
    "廟",
    "寺",
    "咖啡廳",
    "餐廳",
    "飯店",
    "商圈",
    "漁港",
    "森林遊樂區",
    "風景區",
  ],
  foodTerms: [
    "火雞肉飯",
    "砂鍋魚頭",
    "牛肉湯",
    "豆花",
    "冰店",
    "米糕",
    "肉圓",
    "雞肉飯",
    "蚵仔煎",
    "滷肉飯",
    "珍珠奶茶",
    "小籠包",
  ],
  fillerPrefixes: [...COMMON_FILLERS],
  poiPatterns: [
    /[\u3400-\u9fffA-Za-z0-9]{2,20}(夜市|市場|老街|公園|博物館|美術館|車站|火車站|廟|寺|咖啡廳|餐廳|飯店)/g,
  ],
};

export const japanProfile: TravelExtractionProfile = {
  id: "japan",
  country: "Japan",
  supportedLanguages: ["ja", "zh-TW", "zh-Hant", "en"],
  genericLocationNames: [
    "日本",
    "東京",
    "大阪",
    "京都",
    "北海道",
    "九州",
    "關西",
    "關東",
    "tokyo",
    "osaka",
    "kyoto",
    "japan",
  ],
  genericTravelTerms: [...COMMON_GENERIC_TRAVEL_TERMS],
  placeSuffixes: [
    "神社",
    "寺",
    "大社",
    "市場",
    "商店街",
    "駅",
    "站",
    "公園",
    "城",
    "塔",
    "展望台",
    "水族館",
    "博物館",
    "美術館",
    "溫泉",
    "温泉",
    "street",
    "market",
    "station",
    "temple",
    "shrine",
    "castle",
    "tower",
    "park",
    "museum",
  ],
  foodTerms: [
    "拉麵",
    "壽司",
    "燒肉",
    "天婦羅",
    "章魚燒",
    "大阪燒",
    "海鮮丼",
    "鰻魚飯",
    "ramen",
    "sushi",
    "tempura",
    "takoyaki",
    "okonomiyaki",
  ],
  fillerPrefixes: [...COMMON_FILLERS],
  poiPatterns: [
    /[A-Za-z\u3400-\u9fff]{2,24}(駅|寺|神社|市場|公園|城|商店街|温泉|溫泉)/g,
    /[A-Za-z][A-Za-z\s]{1,28}(Market|Station|Temple|Shrine|Castle|Tower|Park|Museum)/gi,
    /\b(Dotonbori|Kuromon Market|Osaka Castle|Tokyo Tower|Senso-ji|Asakusa|Shibuya|Ginza)\b/g,
  ],
};

export const koreaProfile: TravelExtractionProfile = {
  id: "korea",
  country: "Korea",
  supportedLanguages: ["ko", "zh-TW", "zh-Hant", "en"],
  genericLocationNames: [
    "韓國",
    "南韓",
    "首爾",
    "釜山",
    "濟州",
    "korea",
    "seoul",
    "busan",
    "jeju",
  ],
  genericTravelTerms: [...COMMON_GENERIC_TRAVEL_TERMS],
  placeSuffixes: [
    "市場",
    "宮",
    "塔",
    "公園",
    "街",
    "洞",
    "車站",
    "地鐵站",
    "夜市",
    "시장",
    "궁",
    "타워",
    "공원",
    "역",
    "거리",
    "market",
    "palace",
    "tower",
    "park",
    "street",
    "station",
  ],
  foodTerms: [
    "烤肉",
    "炸雞",
    "部隊鍋",
    "辣炒年糕",
    "拌飯",
    "冷麵",
    "泡菜鍋",
    "korean bbq",
    "fried chicken",
    "tteokbokki",
    "bibimbap",
  ],
  fillerPrefixes: [...COMMON_FILLERS],
  poiPatterns: [
    /[A-Za-z\u3400-\u9fff가-힣]{2,24}(시장|궁|타워|공원|역|거리)/g,
    /[A-Za-z][A-Za-z\s]{1,28}(Market|Palace|Tower|Park|Street|Station)/gi,
  ],
};

export const thailandProfile: TravelExtractionProfile = {
  id: "thailand",
  country: "Thailand",
  supportedLanguages: ["th", "zh-TW", "zh-Hant", "en"],
  genericLocationNames: ["泰國", "曼谷", "清邁", "普吉", "thailand", "bangkok", "chiang mai", "phuket"],
  genericTravelTerms: [...COMMON_GENERIC_TRAVEL_TERMS],
  placeSuffixes: [
    "night market",
    "market",
    "temple",
    "station",
    "street",
    "pier",
    "河濱",
    "夜市",
    "寺",
    "碼頭",
  ],
  foodTerms: ["pad thai", "tom yum", "mango sticky rice", "船麵", "泰奶"],
  fillerPrefixes: [...COMMON_FILLERS],
  poiPatterns: [
    /[A-Za-z][A-Za-z\s]{1,28}(Night Market|Market|Temple|Station|Street|Pier)/gi,
  ],
};

export const englishGlobalProfile: TravelExtractionProfile = {
  id: "english-global",
  country: "Global",
  supportedLanguages: ["en"],
  genericLocationNames: ["taiwan", "japan", "korea", "tokyo", "osaka", "seoul"],
  genericTravelTerms: [...COMMON_GENERIC_TRAVEL_TERMS],
  placeSuffixes: ["market", "station", "temple", "shrine", "castle", "tower", "park", "museum", "street", "restaurant", "cafe"],
  foodTerms: ["ramen", "sushi", "takoyaki", "fried chicken", "bibimbap", "noodle", "bbq"],
  fillerPrefixes: [...COMMON_FILLERS],
  poiPatterns: [
    /\b(?:at|visit|next stop is|famous for)\s+([A-Z][A-Za-z0-9' -]{1,40})/gi,
    /[A-Z][A-Za-z0-9' -]{1,40}(Market|Station|Temple|Shrine|Castle|Tower|Park|Museum|Street|Restaurant|Cafe)\b/g,
    /\b(Dotonbori|Kuromon Market|Osaka Castle|Tokyo Tower|Senso-ji|Asakusa|Shibuya|Ginza|Myeongdong|Hongdae|Seoul Tower|Taipei 101)\b/g,
  ],
};

export const defaultGlobalProfile: TravelExtractionProfile = {
  id: "default-global",
  country: "Global",
  supportedLanguages: ["*"],
  genericLocationNames: [...englishGlobalProfile.genericLocationNames, ...taiwanProfile.genericLocationNames],
  genericTravelTerms: [...COMMON_GENERIC_TRAVEL_TERMS],
  placeSuffixes: [...englishGlobalProfile.placeSuffixes, ...taiwanProfile.placeSuffixes],
  foodTerms: [...englishGlobalProfile.foodTerms, ...taiwanProfile.foodTerms],
  fillerPrefixes: [...COMMON_FILLERS],
  poiPatterns: [...englishGlobalProfile.poiPatterns],
};

function normalize(value?: string): string {
  return (value || "").trim().toLowerCase();
}

export function selectTravelExtractionProfile(input: {
  destinationHint?: string;
  transcriptLanguage?: string;
  title?: string;
  description?: string;
}): TravelExtractionProfile {
  const destination = normalize(input.destinationHint);
  const language = normalize(input.transcriptLanguage);
  const title = normalize(input.title);
  const description = normalize(input.description);
  const haystack = [destination, language, title, description].filter(Boolean).join(" ");

  if (/(台灣|臺灣|台北|臺北|台中|臺中|台南|臺南|高雄|嘉義|taiwan|taipei|kaohsiung|tainan|chiayi)/i.test(haystack)) {
    return taiwanProfile;
  }

  if (/(日本|東京|大阪|京都|北海道|關西|關東|japan|tokyo|osaka|kyoto|sapporo)/i.test(haystack)) {
    return japanProfile;
  }

  if (/(韓國|首爾|釜山|濟州|korea|seoul|busan|jeju)/i.test(haystack)) {
    return koreaProfile;
  }

  if (/(泰國|曼谷|清邁|普吉|thailand|bangkok|chiang mai|phuket)/i.test(haystack)) {
    return thailandProfile;
  }

  if (language.startsWith("en")) {
    return englishGlobalProfile;
  }

  return defaultGlobalProfile;
}
