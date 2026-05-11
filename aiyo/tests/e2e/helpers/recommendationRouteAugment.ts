import type { Page } from "@playwright/test";
import type {
  LocationReference,
  VideoRecommendation,
  VideoSummaryResult,
  VideoSummarySegment,
} from "@/types";

/**
 * 端對端專用：攔截所有 GET `/api/videos/recommendations`，立即回 fixture，
 * 避免 YouTube/API 卡住、或因篩選導致 0 筆而無法測試 UI 鏈結。
 *
 * Meta 標註 e2eHarness 以便與正式 API 區分；手動 QA 請勿載入此 route。
 *
 * videoId 僅為佔位：實際摘要以 `installSummarizeE2EHarness` 的假資料為準，
 * 避免因同一 videoId 在 YouTube 上為其他主題而使 E2E 與情境文案不一致。
 */
export const CHIAYI_E2E_STUB_VIDEO: VideoRecommendation = {
  id: "e2e_chiayi_fixture",
  videoId: "s9nDKqJBOII",
  title:
    "嘉義兩天一夜 美食 文化路夜市 林聰明砂鍋魚頭 民主火雞肉飯 檜意森活村 北門驛（E2E 補強）",
  url: "https://www.youtube.com/watch?v=s9nDKqJBOII",
  thumbnail: "https://i.ytimg.com/vi/s9nDKqJBOII/hqdefault.jpg",
  duration: "18:00",
  summary: "Playwright harness：不依賴即時 YouTube API，驗證搜尋欄／列表／摘要 UI。",
  description:
    "文化路夜市、林聰明砂鍋魚頭、民主火雞肉飯、檜意森活村、北門驛、嘉義公園等地點詞彙。",
  source: "e2e-fixture",
  channelTitle: "E2E fixture",
  listProvenance: "youtube-data-api",
  timestamps: [],
  extractedLocations: [],
};

function chiayiE2ELocationPins(): LocationReference[] {
  const rows: Array<Pick<LocationReference, "name" | "lat" | "lng">> = [
    { name: "文化路夜市", lat: 23.47525, lng: 120.44735 },
    { name: "林聰明砂鍋魚頭", lat: 23.47018, lng: 120.44595 },
    { name: "民主火雞肉飯", lat: 23.47792, lng: 120.44558 },
    { name: "檜意森活村", lat: 23.48642, lng: 120.45688 },
    { name: "北門驛", lat: 23.48286, lng: 120.44185 },
  ];
  return rows.map((row) => ({
    ...row,
    description: `${row.name} 是嘉義市兩天一夜情境中可安排的具名地點。`,
    address: `嘉義市${row.name}`,
    placeId: `e2e-place-${row.name}`,
    openingHours: "09:00-21:00",
    phoneNumber: "05-000-0000",
    googleMapsUrl: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(row.name)}`,
    photoUrl: "https://placehold.co/640x360?text=Chiayi",
    resolvedFrom: "google-geocode",
    normalizedName: row.name,
    confidence: 0.88,
    verified: true,
    extractionSource: "deterministic",
  }));
}

function chiayiE2ESegments(): VideoSummarySegment[] {
  return [
    {
      id: "e2e_chiayi_seg_1",
      timestamp: "03:20",
      title: "文化路夜市小吃散步",
      text: "晚間可走文化路夜市，品嚐火雞肉飯與夜市小吃；動線適合適中步調。",
      summary: "晚間可走文化路夜市，品嚐火雞肉飯與夜市小吃；動線適合適中步調。",
      locationHints: ["文化路夜市"],
      foods: ["火雞肉飯", "小吃"],
      startSeconds: 200,
      endSeconds: 270,
      startLabel: "03:20",
      endLabel: "04:30",
      confidence: 0.92,
      extractionSource: "deterministic",
    },
    {
      id: "e2e_chiayi_seg_2",
      timestamp: "05:40",
      title: "民主火雞肉飯重點",
      text: "白天可安排民主火雞肉飯，聚焦在地雞肉飯風味與排隊動線。",
      summary: "白天可安排民主火雞肉飯，聚焦在地雞肉飯風味與排隊動線。",
      locationHints: ["民主火雞肉飯"],
      foods: ["火雞肉飯"],
      startSeconds: 340,
      endSeconds: 410,
      startLabel: "05:40",
      endLabel: "06:50",
      confidence: 0.9,
      extractionSource: "deterministic",
    },
    {
      id: "e2e_chiayi_seg_3",
      timestamp: "08:05",
      title: "林聰明砂鍋魚頭用餐段",
      text: "正餐可規畫林聰明砂鍋魚頭，留意人潮與結束供餐時間。",
      summary: "正餐可規畫林聰明砂鍋魚頭，留意人潮與結束供餐時間。",
      locationHints: ["林聰明砂鍋魚頭"],
      foods: ["砂鍋魚頭"],
      startSeconds: 485,
      endSeconds: 560,
      startLabel: "08:05",
      endLabel: "09:20",
      confidence: 0.9,
      extractionSource: "deterministic",
    },
    {
      id: "e2e_chiayi_seg_4",
      timestamp: "11:50",
      title: "檜意森活村老屋走走",
      text: "老屋聚落與文創小店適合走走拍照，適合適中步行節奏。",
      summary: "老屋聚落與文創小店適合走走拍照，適合適中步行節奏。",
      locationHints: ["檜意森活村"],
      startSeconds: 710,
      endSeconds: 800,
      startLabel: "11:50",
      endLabel: "13:20",
      confidence: 0.88,
      extractionSource: "deterministic",
    },
    {
      id: "e2e_chiayi_seg_5",
      timestamp: "15:05",
      title: "北門驛鐵道文化散步",
      text: "近北門車站區可感受鐵道歷史與周邊街廓，適合下午短停。",
      summary: "近北門車站區可感受鐵道歷史與周邊街廓，適合下午短停。",
      locationHints: ["北門驛"],
      startSeconds: 905,
      endSeconds: 980,
      startLabel: "15:05",
      endLabel: "16:20",
      confidence: 0.87,
      extractionSource: "deterministic",
    },
  ];
}

export function buildChiayiE2eVideoSummaryResult(): VideoSummaryResult {
  const segments = chiayiE2ESegments();
  const locRefs = chiayiE2ELocationPins();
  const extractedNames = locRefs.map((l) => l.name);
  const video: VideoRecommendation = {
    ...CHIAYI_E2E_STUB_VIDEO,
    timestamps: segments.map((s) => ({
      time: s.timestamp,
      label: s.title ?? s.timestamp,
    })),
    summarySegments: segments,
    extractedLocations: locRefs,
  };
  return {
    source: "youtube-summary-service",
    transcriptSource: "fallback-synthetic",
    summarySource: "heuristic-transcript-fallback",
    segmentSource: "deterministic-mentions",
    title: CHIAYI_E2E_STUB_VIDEO.title,
    summary:
      "兩日聚焦嘉義市區：夜市小吃、名城店家的火雞肉飯與砂鍋魚頭，以及老屋聚落與北門鐵道文化動線。",
    segments,
    extractedLocations: extractedNames,
    mapsProvenance: "mixed",
    video,
    debug: {
      transcriptSource: "fallback-synthetic",
      summarySource: "heuristic-transcript-fallback",
      segmentSource: "deterministic-mentions",
    },
  };
}

export async function installRecommendationsE2EHarness(page: Page) {
  await page.route("**/api/videos/recommendations*", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    const reqUrl = route.request().url();
    let keyword: string | null = null;
    try {
      keyword = new URL(reqUrl).searchParams.get("keyword");
    } catch {
      keyword = null;
    }

    const mode =
      keyword && keyword.trim().length > 0
        ? "keyword_search_fixture"
        : "destination_seed_fixture";

    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        success: true,
        data: [CHIAYI_E2E_STUB_VIDEO],
        meta: {
          source: "e2e-harness",
          e2eHarness: true,
          harnessMode: mode,
          harnessNote:
            "此回應由 Playwright 測試攔截產出；評估貼題度請改用手動／正式環境並關閉 harness。",
        },
      }),
    });
  });
}

/**
 * POST `/api/videos/summarize` 的假嘉義結果，避免 E2E 依賴真實 YouTube 字幕主題不一致。
 */
export async function installSummarizeE2EHarness(page: Page) {
  await page.route("**/api/videos/summarize", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    const body = buildChiayiE2eVideoSummaryResult();
    await route.fulfill({
      status: 200,
      contentType: "application/json; charset=utf-8",
      body: JSON.stringify({
        success: true,
        data: body,
        meta: {
          source: "e2e-harness",
          e2eHarness: true,
        },
      }),
    });
  });
}

/** 同時載入 recommendations 與 summarize 兩組 route，適用嘉義情境 E2E。 */
export async function installVideoApisE2EHarness(page: Page) {
  await installRecommendationsE2EHarness(page);
  await installSummarizeE2EHarness(page);
}

/** @deprecated 使用 installRecommendationsE2EHarness；保留別名以降低既有 spec diff */
export async function installRecommendationsAugmentWhenEmpty(page: Page) {
  await installRecommendationsE2EHarness(page);
}
