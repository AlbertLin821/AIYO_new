/**
 * Builds data/planning-destination-catalog.json from preloaded-destinations/*.json
 * plus a small static supplement (Taiwan counties, Japan cities without preload packs).
 *
 * Run: npm run build:planning-destinations
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type CatalogEntry = {
  canonical: string;
  aliases: string[];
  countryCode?: string;
  isCountryLevel?: boolean;
};

type PreloadedPack = {
  destinationHint?: string;
  aliases?: string[];
  id?: string;
};

const SKIP_BROAD_ALIASES = new Set([
  "歐洲",
  "東南亞",
  "東亞",
  "亞洲",
  "關西",
  "關東",
]);

/** Preload pack id → ISO country */
const PRELOAD_ID_COUNTRY: Record<string, string> = {
  tokyo: "JP",
  osaka: "JP",
  kyoto: "JP",
  taipei: "TW",
  paris: "FR",
  london: "GB",
  rome: "IT",
  barcelona: "ES",
  bali: "ID",
  bangkok: "TH",
  seoul: "KR",
  singapore: "SG",
  "hong-kong": "HK",
  macau: "MO",
  "ho-chi-minh": "VN",
  hanoi: "VN",
  sydney: "AU",
  dubai: "AE",
  "new-york": "US",
  "kuala-lumpur": "MY",
};

const COUNTRY_LEVEL_DESTINATIONS: CatalogEntry[] = [
  {
    canonical: "日本",
    countryCode: "JP",
    isCountryLevel: true,
    aliases: ["日本", "japan", "nippon", "にほん", "nihon"],
  },
  {
    canonical: "台灣",
    countryCode: "TW",
    isCountryLevel: true,
    aliases: ["台灣", "臺灣", "taiwan", "formosa"],
  },
  {
    canonical: "韓國",
    countryCode: "KR",
    isCountryLevel: true,
    aliases: ["韓國", "韩国", "korea", "south korea", "首爾圈"],
  },
  {
    canonical: "泰國",
    countryCode: "TH",
    isCountryLevel: true,
    aliases: ["泰國", "泰国", "thailand"],
  },
  {
    canonical: "美國",
    countryCode: "US",
    isCountryLevel: true,
    aliases: ["美國", "美国", "usa", "united states", "america"],
  },
];

/** Destinations / aliases not yet covered by a preloaded pack. */
const SUPPLEMENT: CatalogEntry[] = [
  ...COUNTRY_LEVEL_DESTINATIONS,
  {
    canonical: "嘉義",
    countryCode: "TW",
    aliases: ["嘉義縣", "嘉義市", "嘉義"],
  },
  {
    canonical: "台北",
    countryCode: "TW",
    aliases: ["臺北市", "台北市", "臺北", "台北"],
  },
  {
    canonical: "新北",
    countryCode: "TW",
    aliases: ["新北市", "新北"],
  },
  {
    canonical: "桃園",
    countryCode: "TW",
    aliases: ["桃園市", "桃園"],
  },
  {
    canonical: "台中",
    countryCode: "TW",
    aliases: ["臺中市", "台中市", "臺中", "台中"],
  },
  {
    canonical: "台南",
    countryCode: "TW",
    aliases: ["臺南市", "台南市", "臺南", "台南"],
  },
  {
    canonical: "高雄",
    countryCode: "TW",
    aliases: ["高雄市", "高雄"],
  },
  {
    canonical: "屏東",
    countryCode: "TW",
    aliases: ["屏東縣", "屏東"],
  },
  {
    canonical: "宜蘭",
    countryCode: "TW",
    aliases: ["宜蘭縣", "宜蘭"],
  },
  {
    canonical: "花蓮",
    countryCode: "TW",
    aliases: ["花蓮縣", "花蓮"],
  },
  {
    canonical: "台東",
    countryCode: "TW",
    aliases: ["臺東縣", "台東縣", "臺東", "台東"],
  },
  {
    canonical: "澎湖",
    countryCode: "TW",
    aliases: ["澎湖縣", "澎湖"],
  },
  {
    canonical: "金門",
    countryCode: "TW",
    aliases: ["金門縣", "金門"],
  },
  {
    canonical: "馬祖",
    countryCode: "TW",
    aliases: ["連江縣", "馬祖"],
  },
  {
    canonical: "墾丁",
    countryCode: "TW",
    aliases: ["墾丁"],
  },
  {
    canonical: "清境",
    countryCode: "TW",
    aliases: ["清境"],
  },
  {
    canonical: "日月潭",
    countryCode: "TW",
    aliases: ["日月潭"],
  },
  {
    canonical: "阿里山",
    countryCode: "TW",
    aliases: ["阿里山"],
  },
  {
    canonical: "九份",
    countryCode: "TW",
    aliases: ["九份"],
  },
  {
    canonical: "熊本",
    countryCode: "JP",
    aliases: ["熊本", "熊本市", "Kumamoto"],
  },
  {
    canonical: "福岡",
    countryCode: "JP",
    aliases: ["福岡", "福岡市", "Fukuoka"],
  },
  {
    canonical: "九州",
    countryCode: "JP",
    aliases: ["九州", "kyushu"],
  },
  {
    canonical: "阿蘇",
    countryCode: "JP",
    aliases: ["阿蘇"],
  },
  {
    canonical: "由布院",
    countryCode: "JP",
    aliases: ["由布院"],
  },
  {
    canonical: "別府",
    countryCode: "JP",
    aliases: ["別府"],
  },
  {
    canonical: "長崎",
    countryCode: "JP",
    aliases: ["長崎"],
  },
  {
    canonical: "鹿兒島",
    countryCode: "JP",
    aliases: ["鹿兒島"],
  },
  {
    canonical: "沖繩",
    countryCode: "JP",
    aliases: ["沖繩", "那霸", "Okinawa", "Naha"],
  },
  {
    canonical: "北海道",
    countryCode: "JP",
    aliases: ["北海道", "札幌", "Sapporo", "Hokkaido"],
  },
  {
    canonical: "仙台",
    countryCode: "JP",
    aliases: ["仙台", "Sendai"],
  },
  {
    canonical: "名古屋",
    countryCode: "JP",
    aliases: ["名古屋", "Nagoya"],
  },
  {
    canonical: "橫濱",
    countryCode: "JP",
    aliases: ["橫濱", "橫浜", "Yokohama"],
  },
  {
    canonical: "神戶",
    countryCode: "JP",
    aliases: ["神戶", "神戸", "Kobe"],
  },
  {
    canonical: "奈良",
    countryCode: "JP",
    aliases: ["奈良", "Nara"],
  },
  {
    canonical: "箱根",
    countryCode: "JP",
    aliases: ["箱根", "Hakone"],
  },
  {
    canonical: "伊豆",
    countryCode: "JP",
    aliases: ["伊豆", "Izu"],
  },
  {
    canonical: "輕井澤",
    countryCode: "JP",
    aliases: ["輕井澤", "軽井沢", "Karuizawa"],
  },
  {
    canonical: "東京",
    countryCode: "JP",
    aliases: ["東京", "Tokyo", "东基", "東基", "東急"],
  },
  {
    canonical: "大阪",
    countryCode: "JP",
    aliases: ["大阪", "Osaka"],
  },
  {
    canonical: "京都",
    countryCode: "JP",
    aliases: ["京都", "Kyoto"],
  },
  {
    canonical: "首爾",
    countryCode: "KR",
    aliases: ["首爾", "Seoul"],
  },
  {
    canonical: "釜山",
    countryCode: "KR",
    aliases: ["釜山", "Busan"],
  },
];

function slugToTitle(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeAlias(value: string): string | undefined {
  const trimmed = value.trim();
  if (trimmed.length < 2) {
    return undefined;
  }
  if (SKIP_BROAD_ALIASES.has(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function mergeEntry(
  map: Map<string, CatalogEntry>,
  canonical: string,
  aliases: string[],
  countryCode?: string,
  isCountryLevel?: boolean,
) {
  const key = canonical.trim();
  if (!key) {
    return;
  }
  const existing = map.get(key);
  const aliasSet = new Set(existing?.aliases ?? []);
  aliasSet.add(key);
  for (const alias of aliases) {
    const normalized = normalizeAlias(alias);
    if (normalized) {
      aliasSet.add(normalized);
    }
  }
  map.set(key, {
    canonical: key,
    aliases: [...aliasSet].sort((a, b) => b.length - a.length),
    countryCode: existing?.countryCode || countryCode,
    isCountryLevel: existing?.isCountryLevel || isCountryLevel,
  });
}

async function main() {
  const root = process.cwd();
  const preloadDir = path.join(root, "data", "preloaded-destinations");
  const outPath = path.join(root, "data", "planning-destination-catalog.json");

  const map = new Map<string, CatalogEntry>();

  for (const entry of SUPPLEMENT) {
    mergeEntry(map, entry.canonical, entry.aliases, entry.countryCode, entry.isCountryLevel);
  }

  const files = await readdir(preloadDir);
  for (const file of files) {
    if (!file.endsWith(".json") || file === "index.json") {
      continue;
    }
    const raw = await readFile(path.join(preloadDir, file), "utf8");
    const pack = JSON.parse(raw) as PreloadedPack;
    const slug = path.basename(file, ".json");
    const canonical =
      pack.destinationHint?.trim() ||
      slugToTitle(slug);
    const aliases = [...(pack.aliases ?? [])];
    if (pack.id) {
      aliases.push(pack.id.replace(/-/g, " "));
    }
    const countryCode = PRELOAD_ID_COUNTRY[slug] || PRELOAD_ID_COUNTRY[pack.id || ""];
    mergeEntry(map, canonical, aliases, countryCode);
  }

  const entries: CatalogEntry[] = [...map.values()].sort((a, b) =>
    a.canonical.localeCompare(b.canonical, "zh-Hant"),
  );

  const payload = {
    version: 2,
    generatedAt: new Date().toISOString(),
    source: "preloaded-destinations + supplement",
    entries,
  };

  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  console.log(`Wrote ${entries.length} destinations to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
