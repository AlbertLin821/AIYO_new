import type { ChatMessage } from "@/types";
import type { SourceReference } from "@/lib/types/sources";
import type { ItineraryDay, Trip } from "@/lib/types/itinerary";

/** Demo sources: YouTube + website + Google Place — 固定 id 供 mock itinerary 引用 */
export const MOCK_GROUNDED_SOURCES: SourceReference[] = [
  {
    id: "mock_src_youtube_kumamoto_001",
    type: "youtube",
    title: "熊本自由行｜熊本城與黑亭拉麵一日走透透",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    snippet: "建議上午先看熊本城，午餐可安排黑亭拉麵本店，下午前往櫻之馬場城彩苑。",
    thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
    provider: "youtube",
    retrievedAt: new Date().toISOString(),
    confidence: 0.85,
    youtube: {
      videoId: "dQw4w9WgXcQ",
      channelTitle: "Mock Travel Channel",
      startSeconds: 201,
      endSeconds: 250,
      timestampLabel: "03:21",
      transcriptText: "從熊本車站出發，搭電車到熊本城約十分鐘...",
    },
  },
  {
    id: "mock_src_website_kumamoto_official_001",
    type: "website",
    title: "熊本城官方導覽｜參觀時間與門票",
    url: "https://example.com/kumamoto-castle-official",
    snippet: "開園時間與休館日請以官網公告為準；本資料為展示用 mock。",
    provider: "mock-web",
    retrievedAt: new Date().toISOString(),
    website: {
      siteName: "Mock Official Tourism",
      publishedAt: "2026-01-10",
      canonicalUrl: "https://example.com/kumamoto-castle-official",
    },
  },
  {
    id: "mock_src_place_kumamoto_castle_001",
    type: "google_place",
    title: "熊本城",
    url: "https://maps.google.com/?cid=mock",
    snippet: "日本著名櫻花與名城景點（展示用地點資料）。",
    provider: "mock-google-places",
    retrievedAt: new Date().toISOString(),
    googlePlace: {
      placeId: "ChIJmockKumamotoCastle",
      name: "熊本城",
      address: "日本熊本縣熊本市中央区本丸1-1",
      rating: 4.4,
      userRatingCount: 12800,
      lat: 32.806,
      lng: 130.706,
    },
  },
];

const MOCK_DAY_1_ID = "mock_day_1";
const MOCK_DAY_2_ID = "mock_day_2";

function mockItineraryDays(): ItineraryDay[] {
  return [
    {
      id: MOCK_DAY_1_ID,
      dayIndex: 1,
      title: "第 1 天｜熊本市區經典",
      date: "2026-06-01",
      summary: "城跡、拉麵、伴手禮一線巡覽（mock）。",
      items: [
        {
          id: "mock_item_d1_1",
          dayId: MOCK_DAY_1_ID,
          orderIndex: 0,
          startTime: "09:00",
          endTime: "11:30",
          title: "熊本城",
          description: "建議先行預約導覽；實際開放時間以官方為準。",
          itemType: "place",
          place: {
            id: "mock_place_castle",
            name: "熊本城",
            address: "熊本市中央区本丸1-1",
            lat: 32.806,
            lng: 130.706,
            googlePlaceId: "ChIJmockKumamotoCastle",
            rating: 4.4,
          },
          durationMinutes: 150,
          sourceIds: ["mock_src_youtube_kumamoto_001", "mock_src_place_kumamoto_castle_001"],
        },
        {
          id: "mock_item_d1_2",
          dayId: MOCK_DAY_1_ID,
          orderIndex: 1,
          startTime: "12:00",
          endTime: "13:30",
          title: "黑亭拉麵本店",
          description: "豚骨拉麵名店（mock 展示）。",
          itemType: "meal",
          durationMinutes: 90,
          sourceIds: ["mock_src_youtube_kumamoto_001"],
        },
        {
          id: "mock_item_d1_3",
          dayId: MOCK_DAY_1_ID,
          orderIndex: 2,
          startTime: "14:30",
          endTime: "16:00",
          title: "櫻之馬場 城彩苑",
          description: "伴手禮與在地小吃集中區。",
          itemType: "activity",
          durationMinutes: 90,
          sourceIds: ["mock_src_website_kumamoto_official_001"],
        },
      ],
    },
    {
      id: MOCK_DAY_2_ID,
      dayIndex: 2,
      title: "第 2 天｜近郊散步",
      date: "2026-06-02",
      summary: "輕鬆步調與自然景點（mock）。",
      items: [
        {
          id: "mock_item_d2_1",
          dayId: MOCK_DAY_2_ID,
          orderIndex: 0,
          startTime: "10:00",
          endTime: "12:00",
          title: "水前寺成趣園",
          description: "迴遊式庭園，適合慢走拍照。",
          itemType: "place",
          durationMinutes: 120,
          sourceIds: ["mock_src_website_kumamoto_official_001"],
        },
        {
          id: "mock_item_d2_2",
          dayId: MOCK_DAY_2_ID,
          orderIndex: 1,
          startTime: "12:30",
          endTime: "14:00",
          title: "乡土料理午餐",
          description: "馬肉料理或在地定食（mock）。",
          itemType: "meal",
          durationMinutes: 90,
          sourceIds: ["mock_src_youtube_kumamoto_001"],
        },
        {
          id: "mock_item_d2_3",
          dayId: MOCK_DAY_2_ID,
          orderIndex: 2,
          startTime: "15:00",
          endTime: "17:00",
          title: "商店街散策",
          description: "上通・下通商店街自由活動。",
          itemType: "free_time",
          durationMinutes: 120,
          sourceIds: ["mock_src_place_kumamoto_castle_001"],
        },
      ],
    },
  ];
}

export function getMockGroundedTrip(): Trip {
  const now = new Date().toISOString();
  return {
    id: "mock_trip_kumamoto_demo",
    title: "熊本五天四夜（可溯源展示）",
    destination: "熊本縣",
    origin: "台灣（mock）",
    startDate: "2026-06-01",
    endDate: "2026-06-05",
    days: mockItineraryDays(),
    preferences: {
      durationDays: 5,
      budgetLevel: "medium",
      pace: "balanced",
      companions: ["couple"],
      interests: ["美食", "自然"],
      language: "zh-TW",
    },
    sources: MOCK_GROUNDED_SOURCES,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 插入對話用的助理訊息：含結構化來源，不使用文字內嵌 [1] 假引用。
 */
export function createMockGroundedAssistantMessage(): ChatMessage {
  const trip = getMockGroundedTrip();
  const lines = [
    "這是一則**可溯源範例回覆**（mock 資料，非即時查詢）：",
    "",
    `我為你草擬了「${trip.title}」的精簡行程骨架，重點景點與餐飲都綁定了影片、官網與地點來源。`,
    "",
    `• 第 1 天包含：${trip.days[0]?.items.map((i) => i.title).join("、")}`,
    `• 第 2 天包含：${trip.days[1]?.items.map((i) => i.title).join("、")}`,
    "",
    "請使用下方**來源標籤**查看各引用；實際預約與開放時間請再以官方為準。",
  ];
  return {
    id: `chat_assistant_grounded_mock_${Date.now()}`,
    role: "assistant",
    content: lines.join("\n"),
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    responseType: "text_message",
    sourceReferences: MOCK_GROUNDED_SOURCES,
    metadata: {
      mock: true,
      mockTripId: trip.id,
    },
  };
}
