import { mockVideos } from "@/lib/mock-data";
import {
  rankRecommendedVideos,
  type UserTravelPreference,
  type VideoCandidate,
} from "@/lib/recommendation";
import { mergeCachedSummaryIntoVideo } from "@/lib/mergeVideoSummaries";
import {
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import { serverConfig } from "@/server/config";
import {
  buildVideoRecommendationSearchQuery,
  isTravelRelatedVideo,
} from "@/server/providers/travelVideoFilter";
import { getPreloadedDestinationVideos, resolvePreloadedDestinationHint } from "@/server/data/preloadedDestinations";
import { resolveTripDestinationScopeWithGeocode } from "@/server/places/resolveTripDestinationScope";
import { searchYouTubeVideos, type VideoSearchDebugInfo } from "@/server/providers/youtubeProvider";
import { getCachedVideoSummaryForVideoId } from "@/server/services/videoSummaryService";
import type { VideoRecommendation } from "@/types";

interface RecommendationInput {
  destination?: string;
  keyword?: string;
  days?: number;
  preferences?: string[];
  travelStyle?: string;
  budget?: string;
  companions?: string[];
  limit?: number;
  offset?: number;
  excludeVideoIds?: string[];
}

export type VideoRecommendationOutcome = {
  videos: VideoRecommendation[];
  source: "youtube-data-api" | "mock-fallback" | "preloaded-destination-seed";
  fallbackReason?: string;
  debug?: VideoSearchDebugInfo;
};

function scoreVideo(video: VideoRecommendation, input: RecommendationInput): number {
  const haystack = [
    video.title,
    video.summary,
    video.description,
    video.relevanceReason || "",
    video.channelTitle || "",
    ...video.extractedLocations.map((location) => location.name),
  ]
    .join(" ")
    .toLowerCase();

  let score = 0;
  if (input.destination && haystack.includes(input.destination.toLowerCase())) {
    score += 3;
  }
  if (input.keyword && haystack.includes(input.keyword.toLowerCase())) {
    score += 2;
  }
  return score;
}

function rankFallbackVideos(input: RecommendationInput): VideoRecommendation[] {
  const limit = Math.max(1, Math.min(input.limit || 10, 12));
  const offset = Math.max(0, input.offset || 0);
  const excluded = new Set((input.excludeVideoIds || []).map((id) => id.trim()).filter(Boolean));
  const rawQ =
    buildVideoRecommendationSearchQuery({
      keyword: input.keyword,
      destination: input.destination,
    }) || "travel";
  return [...mockVideos]
    .map((video) => ({
      video: {
        ...video,
        source: "mock-fallback",
        listProvenance: "mock-fallback" as const,
      },
      score: scoreVideo(video, input),
    }))
    .filter((entry) =>
      isTravelRelatedVideo(
        {
          title: entry.video.title,
          description: entry.video.description,
          channelTitle: entry.video.channelTitle,
        },
        rawQ,
      ),
    )
    .sort((left, right) => right.score - left.score)
    .filter((entry) => !excluded.has(entry.video.videoId || entry.video.id))
    .slice(offset, offset + limit)
    .map((entry) => entry.video);
}

const taiwanCityFallbackVideos: Array<VideoRecommendation & {
  city: string;
  tags: string[];
  viewCount: number;
}> = [
  {
    id: "taiwan_taipei_1",
    videoId: "THbBVhNwTFo",
    title: "台北四日旅遊攻略：夜市、溫泉與城市散步",
    thumbnail: "https://i.ytimg.com/vi/THbBVhNwTFo/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=THbBVhNwTFo",
    duration: "20:45",
    summary: "台北市區與近郊景點串連，含夜市、美食與溫泉行程。",
    description: "台北旅遊行程：台北101、士林夜市、饒河夜市、北投溫泉與老城區散步。",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：台北城市旅遊與美食密度高。",
    timestamps: [
      { time: "00:02:15", label: "台北101與信義商圈" },
      { time: "00:08:40", label: "士林夜市小吃動線" },
      { time: "00:14:20", label: "北投溫泉放鬆路線" },
    ],
    extractedLocations: [
      {
        name: "台北101",
        lat: 25.033964,
        lng: 121.564468,
        description: "台北地標與觀景熱點，可搭配信義商圈逛街。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "士林夜市",
        lat: 25.087111,
        lng: 121.525131,
        description: "台北經典夜市，適合安排晚餐與小吃巡禮。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "北投溫泉區",
        lat: 25.137636,
        lng: 121.506457,
        description: "捷運可達的溫泉區，適合半日放鬆行程。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
    ],
    summarySegments: [
      {
        id: "default_taipei_seg_1",
        timestamp: "00:02:15",
        startLabel: "00:02:15",
        startSeconds: 135,
        title: "台北101與信義商圈",
        text: "先走訪台北101周邊，白天看城市天際線，晚上可接信義商圈用餐。",
        locationHints: ["台北101", "信義商圈"],
      },
      {
        id: "default_taipei_seg_2",
        timestamp: "00:08:40",
        startLabel: "00:08:40",
        startSeconds: 520,
        title: "士林夜市覓食",
        text: "影片整理士林夜市必吃動線，建議晚間集中安排小吃與甜點。",
        locationHints: ["士林夜市"],
      },
      {
        id: "default_taipei_seg_3",
        timestamp: "00:14:20",
        startLabel: "00:14:20",
        startSeconds: 860,
        title: "北投溫泉半日行",
        text: "以北投溫泉做收尾，搭配地熱谷與溫泉街散步節奏更完整。",
        locationHints: ["北投溫泉區", "地熱谷"],
      },
    ],
    listProvenance: "mock-fallback",
    city: "台北",
    tags: ["台北", "美食", "夜市", "文青", "三日遊"],
    viewCount: 320000,
  },
  {
    id: "taiwan_newtaipei_1",
    videoId: "s9nDKqJBOII",
    title: "新北淡水景點完整攻略：老街、古蹟與河岸夕景",
    thumbnail: "https://i.ytimg.com/vi/s9nDKqJBOII/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=s9nDKqJBOII",
    duration: "15:58",
    summary: "新北淡水沿線景點一次看，適合捷運可達的一日或兩日安排。",
    description: "新北淡水旅遊包含淡水老街、紅毛城、漁人碼頭與歷史街區散步。",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：新北能補足山海線與老街體驗。",
    timestamps: [
      { time: "00:01:45", label: "淡水老街散步與小吃" },
      { time: "00:06:50", label: "紅毛城歷史景點" },
      { time: "00:11:30", label: "漁人碼頭看夕陽" },
    ],
    extractedLocations: [
      {
        name: "淡水老街",
        lat: 25.170903,
        lng: 121.440805,
        description: "捷運淡水站周邊必逛老街，適合邊走邊吃。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "紅毛城",
        lat: 25.174462,
        lng: 121.433924,
        description: "經典歷史古蹟，可俯瞰淡水河口景色。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "淡水漁人碼頭",
        lat: 25.183407,
        lng: 121.414278,
        description: "黃昏時段熱門景點，可安排看夕陽與夜景。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
    ],
    summarySegments: [
      {
        id: "default_newtaipei_seg_1",
        timestamp: "00:01:45",
        startLabel: "00:01:45",
        startSeconds: 105,
        title: "淡水老街吃逛路線",
        text: "先從淡水老街出發，影片整理多個在地小吃與河岸散步點。",
        locationHints: ["淡水老街"],
      },
      {
        id: "default_newtaipei_seg_2",
        timestamp: "00:06:50",
        startLabel: "00:06:50",
        startSeconds: 410,
        title: "紅毛城歷史段落",
        text: "中段安排紅毛城與周邊古蹟，行程兼顧文化與景觀拍照。",
        locationHints: ["紅毛城"],
      },
      {
        id: "default_newtaipei_seg_3",
        timestamp: "00:11:30",
        startLabel: "00:11:30",
        startSeconds: 690,
        title: "漁人碼頭夕陽",
        text: "壓軸在漁人碼頭看夕陽，適合接晚餐與情人橋夜景。",
        locationHints: ["淡水漁人碼頭", "情人橋"],
      },
    ],
    listProvenance: "mock-fallback",
    city: "新北",
    tags: ["新北", "景點", "自然", "老街"],
    viewCount: 210000,
  },
  {
    id: "taiwan_taoyuan_1",
    videoId: "FnpK46d87zM",
    title: "桃園老城區郊遊路線：古廟與市場小吃",
    thumbnail: "https://i.ytimg.com/vi/FnpK46d87zM/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=FnpK46d87zM",
    duration: "02:39",
    summary: "桃園舊城短路線示範，結合古廟、老街與在地小吃。",
    description: "桃園老城旅遊路線，從文昌廟、新民街到景福宮周邊美食。",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：桃園適合親子與短天數安排。",
    timestamps: [
      { time: "00:00:32", label: "文昌廟周邊起走" },
      { time: "00:01:08", label: "新民街老城散步" },
      { time: "00:01:50", label: "景福宮與大廟口" },
    ],
    extractedLocations: [
      {
        name: "桃園文昌廟",
        lat: 24.991835,
        lng: 121.311077,
        description: "桃園舊城重要信仰據點，適合作為散步路線起點。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "新民街",
        lat: 24.993721,
        lng: 121.309215,
        description: "老街區可串接特色小店與歷史建築。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "桃園景福宮",
        lat: 24.993132,
        lng: 121.312068,
        description: "大廟商圈核心景點，周邊聚集在地美食。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
    ],
    summarySegments: [
      {
        id: "default_taoyuan_seg_1",
        timestamp: "00:00:32",
        startLabel: "00:00:32",
        startSeconds: 32,
        title: "文昌廟起走",
        text: "從文昌廟出發，先熟悉桃園老城區步行動線與周邊小吃點。",
        locationHints: ["桃園文昌廟"],
      },
      {
        id: "default_taoyuan_seg_2",
        timestamp: "00:01:08",
        startLabel: "00:01:08",
        startSeconds: 68,
        title: "新民街店家巡禮",
        text: "中段帶到新民街，適合安排文創小店與街區拍照停留。",
        locationHints: ["新民街"],
      },
      {
        id: "default_taoyuan_seg_3",
        timestamp: "00:01:50",
        startLabel: "00:01:50",
        startSeconds: 110,
        title: "景福宮美食收尾",
        text: "最後回到景福宮周邊，集中品嘗大廟口在地小吃。",
        locationHints: ["桃園景福宮"],
      },
    ],
    listProvenance: "mock-fallback",
    city: "桃園",
    tags: ["桃園", "親子", "美食", "兩天一夜"],
    viewCount: 145000,
  },
  {
    id: "taiwan_taichung_1",
    videoId: "M4sImXGN4R0",
    title: "台中一日攻略：國家歌劇院、審計新村與夜市",
    thumbnail: "https://i.ytimg.com/vi/M4sImXGN4R0/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=M4sImXGN4R0",
    duration: "26:22",
    summary: "台中市區一日路線，兼顧建築景點、文創街區與夜市。",
    description: "台中旅遊影片整理 12 個景點，含國家歌劇院、審計新村與逢甲夜市。",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：台中適合美食、咖啡與文青景點。",
    timestamps: [
      { time: "00:03:40", label: "國家歌劇院建築巡禮" },
      { time: "00:09:30", label: "審計新村文創散步" },
      { time: "00:17:10", label: "臺中逢甲夜市美食段" },
    ],
    extractedLocations: [
      {
        name: "臺中國家歌劇院",
        lat: 24.162879,
        lng: 120.640213,
        description: "台中地標建築，適合安排拍照與室內展覽參觀。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "審計新村",
        lat: 24.147736,
        lng: 120.663134,
        description: "文創聚落與特色店家集中區，適合午後散步。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "臺中市西屯區逢甲夜市",
        lat: 24.175722,
        lng: 120.646646,
        description: "臺中市西屯區高人氣夜市商圈，建議安排晚間主力覓食行程。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
    ],
    summarySegments: [
      {
        id: "default_taichung_seg_1",
        timestamp: "00:03:40",
        startLabel: "00:03:40",
        startSeconds: 220,
        title: "歌劇院與周邊散步",
        text: "先到國家歌劇院看建築曲線，周邊步行可串接商圈休息點。",
        locationHints: ["臺中國家歌劇院"],
      },
      {
        id: "default_taichung_seg_2",
        timestamp: "00:09:30",
        startLabel: "00:09:30",
        startSeconds: 570,
        title: "審計新村文創店",
        text: "審計新村適合安排下午時段，影片提供多個拍照與小店重點。",
        locationHints: ["審計新村"],
      },
      {
        id: "default_taichung_seg_3",
        timestamp: "00:17:10",
        startLabel: "00:17:10",
        startSeconds: 1030,
        title: "臺中逢甲夜市與西屯宵夜動線",
        summary:
          "介紹臺中市西屯區逢甲夜市周邊的街頭小吃與商圈動線，適合排入晚餐至宵夜時段，並可銜接隔日台中市區行程。",
        text: "介紹臺中市西屯區逢甲夜市周邊的街頭小吃與商圈動線，適合排入晚餐至宵夜時段，並可銜接隔日台中市區行程。",
        locationHints: ["臺中市西屯區逢甲夜市"],
      },
    ],
    listProvenance: "mock-fallback",
    city: "台中",
    tags: ["台中", "美食", "文青", "咖啡", "兩日遊"],
    viewCount: 380000,
  },
  {
    id: "taiwan_tainan_1",
    videoId: "8BUlTDSLOw4",
    title: "台南 36 小時玩法：古城散步與在地美食",
    thumbnail: "https://i.ytimg.com/vi/8BUlTDSLOw4/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=8BUlTDSLOw4",
    duration: "35:47",
    summary: "台南老城區深度散步，結合古蹟巡禮與在地小吃。",
    description: "台南旅遊包含赤崁樓、臺南孔廟、臺南武聖夜市、國華街三段美食商圈與老城美食探索。",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：台南與美食、古蹟、文青偏好高度相關。",
    timestamps: [
      { time: "00:04:20", label: "赤崁樓古蹟段" },
      { time: "00:10:40", label: "孔廟商圈步行" },
      { time: "00:21:35", label: "臺南武聖夜市宵夜" },
    ],
    extractedLocations: [
      {
        name: "赤崁樓",
        lat: 22.997118,
        lng: 120.202355,
        description: "台南代表性古蹟，可作為老城區路線起點。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "臺南孔廟",
        lat: 22.990788,
        lng: 120.204371,
        description: "歷史文化核心景點，周邊街區適合慢步調探索。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "臺南武聖夜市",
        lat: 23.005495,
        lng: 120.187226,
        description: "臺南市中西區高人氣夜市，適合安排晚餐與宵夜小吃巡禮。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "國華街三段美食商圈",
        lat: 22.9975,
        lng: 120.1989,
        description: "鄰近赤崁樓與水仙宮的巷弄美食聚落，可與老城散步同日安排。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
    ],
    summarySegments: [
      {
        id: "default_tainan_seg_1",
        timestamp: "00:04:20",
        startLabel: "00:04:20",
        startSeconds: 260,
        title: "赤崁樓與府城歷史核心",
        summary:
          "介紹赤崁樓作為臺南府城散步起點，串連周邊古蹟與巷弄，適合規劃半日文化行程。",
        text: "介紹赤崁樓作為臺南府城散步起點，串連周邊古蹟與巷弄，適合規劃半日文化行程。",
        locationHints: ["赤崁樓"],
      },
      {
        id: "default_tainan_seg_2",
        timestamp: "00:10:40",
        startLabel: "00:10:40",
        startSeconds: 640,
        title: "臺南孔廟與中西區巷弄散步",
        summary:
          "說明臺南孔廟周邊步行節奏，可搭配國華街三段美食商圈的在地小吃與咖啡停留。",
        text: "說明臺南孔廟周邊步行節奏，可搭配國華街三段美食商圈的在地小吃與咖啡停留。",
        locationHints: ["臺南孔廟", "國華街三段美食商圈"],
      },
      {
        id: "default_tainan_seg_3",
        timestamp: "00:21:35",
        startLabel: "00:21:35",
        startSeconds: 1295,
        title: "臺南武聖夜市與府城宵夜",
        summary:
          "聚焦臺南武聖夜市周邊的府城宵夜選擇，例如擔仔麵、棺材板與牛肉湯，適合作為一日行程的晚餐與夜間散步收尾。",
        text: "聚焦臺南武聖夜市周邊的府城宵夜選擇，例如擔仔麵、棺材板與牛肉湯，適合作為一日行程的晚餐與夜間散步收尾。",
        locationHints: ["臺南武聖夜市"],
      },
    ],
    listProvenance: "mock-fallback",
    city: "台南",
    tags: ["台南", "三日遊", "美食", "古蹟", "文青"],
    viewCount: 520000,
  },
  {
    id: "taiwan_kaohsiung_1",
    videoId: "XLbEtIO8Grs",
    title: "高雄初訪行程：旗津海鮮與港灣海景",
    thumbnail: "https://i.ytimg.com/vi/XLbEtIO8Grs/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=XLbEtIO8Grs",
    duration: "16:05",
    summary: "高雄港灣與旗津路線，結合海景、海鮮與渡輪體驗。",
    description: "高雄旅遊包含旗津老街、黑沙灘與港都海景路線，適合一日輕旅行。",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：高雄適合港灣景色、夜市與親子安排。",
    timestamps: [
      { time: "00:02:40", label: "旗津渡輪進場" },
      { time: "00:06:15", label: "旗津老街海鮮" },
      { time: "00:11:20", label: "黑沙灘海景段" },
    ],
    extractedLocations: [
      {
        name: "旗津老街",
        lat: 22.615881,
        lng: 120.267329,
        description: "高雄人氣海鮮街區，可搭配渡輪與海岸散步。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "旗津海水浴場",
        lat: 22.610977,
        lng: 120.265499,
        description: "可看海放鬆的海岸區域，適合安排下午時段。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
      {
        name: "高雄港",
        lat: 22.61626,
        lng: 120.300451,
        description: "港灣景觀核心區，可銜接駁二與周邊步行動線。",
        verified: true,
        resolvedFrom: "google-geocode",
      },
    ],
    summarySegments: [
      {
        id: "default_kaohsiung_seg_1",
        timestamp: "00:02:40",
        startLabel: "00:02:40",
        startSeconds: 160,
        title: "旗津渡輪移動",
        text: "先從渡輪進旗津，快速進入高雄港灣旅遊節奏。",
        locationHints: ["高雄港", "旗津渡輪站"],
      },
      {
        id: "default_kaohsiung_seg_2",
        timestamp: "00:06:15",
        startLabel: "00:06:15",
        startSeconds: 375,
        title: "旗津老街海鮮",
        text: "中段主打旗津老街海鮮與在地小吃，適合安排午晚餐。",
        locationHints: ["旗津老街"],
      },
      {
        id: "default_kaohsiung_seg_3",
        timestamp: "00:11:20",
        startLabel: "00:11:20",
        startSeconds: 680,
        title: "黑沙灘與海景",
        text: "最後到旗津海岸看黑沙灘與海景，安排拍照與散步收尾。",
        locationHints: ["旗津海水浴場"],
      },
    ],
    listProvenance: "mock-fallback",
    city: "高雄",
    tags: ["高雄", "夜市", "親子", "景點", "兩天一夜"],
    viewCount: 275000,
  },
];

const taiwanCityAliases: Record<string, string[]> = {
  台北: ["taipei", "臺北"],
  新北: ["new taipei", "newtaipei"],
  桃園: ["taoyuan"],
  台中: ["taichung", "臺中"],
  台南: ["tainan", "臺南"],
  高雄: ["kaohsiung"],
};

function toPreference(input: RecommendationInput): UserTravelPreference {
  return {
    destination: input.destination,
    days: input.days,
    preferences: input.preferences || (input.keyword ? [input.keyword] : []),
    travelStyle: input.travelStyle,
    budget: input.budget,
    companions: input.companions,
  };
}

function rankTaiwanCityFallbackVideos(input: RecommendationInput): VideoRecommendation[] {
  const limit = Math.max(1, Math.min(input.limit || 6, 12));
  const offset = Math.max(0, input.offset || 0);
  const excluded = new Set((input.excludeVideoIds || []).map((id) => id.trim()).filter(Boolean));
  const ranked = rankRecommendedVideos(
    taiwanCityFallbackVideos.map((video): VideoCandidate => ({
      videoId: video.videoId || video.id,
      title: video.title,
      description: video.description,
      publishedAt: video.publishedAt || "2026-01-01T00:00:00.000Z",
      viewCount: video.viewCount,
      city: video.city,
      tags: video.tags,
      duration: video.duration,
      channelTitle: video.channelTitle,
    })),
    toPreference(input),
    limit + offset + excluded.size,
  );

  const byId = new Map(taiwanCityFallbackVideos.map((video) => [video.videoId, video]));
  return ranked
    .map((scored) => {
      const source = byId.get(scored.videoId) || taiwanCityFallbackVideos[0];
      return {
        ...source,
        relevanceReason: `${source.relevanceReason} 推薦分數 ${scored.score}。`,
      };
    })
    .filter((video) => !excluded.has(video.videoId || video.id))
    .slice(offset, offset + limit);
}

function hasTaiwanCityFallbackRelevance(input: RecommendationInput): boolean {
  const query = [
    input.destination,
    input.keyword,
    ...(input.preferences || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (!query.trim()) {
    return true;
  }

  return taiwanCityFallbackVideos.some((video) =>
    [video.city, ...(taiwanCityAliases[video.city] || []), ...video.tags].some((token) =>
      query.includes(token.toLowerCase()),
    ),
  );
}

function getRelevantFallbackVideos(input: RecommendationInput): VideoRecommendation[] {
  const taiwanFallback = hasTaiwanCityFallbackRelevance(input)
    ? rankTaiwanCityFallbackVideos(input)
    : [];
  if (taiwanFallback.length > 0) {
    return taiwanFallback;
  }
  return rankFallbackVideos(input);
}

async function resolveDestinationScopeForRecommendation(
  destination?: string,
): Promise<TripDestinationScope | null> {
  const fromCatalog = resolveTripDestinationScope(destination);
  if (fromCatalog?.countryCodes.length) {
    return fromCatalog;
  }
  const trimmed = destination?.trim();
  if (!trimmed) {
    return fromCatalog;
  }
  return (await resolveTripDestinationScopeWithGeocode(trimmed)) ?? fromCatalog;
}

function filterPreloadedVideosByScope(
  videos: VideoRecommendation[],
  scope: TripDestinationScope | null,
): VideoRecommendation[] {
  if (!scope?.countryCodes.length) {
    return videos;
  }
  return videos.filter((video) =>
    isTextInTripDestinationScope(
      [video.title, video.description || ""].filter(Boolean).join(" "),
      scope,
    ),
  );
}

async function normalizeRecommendationInput(input: RecommendationInput): Promise<RecommendationInput> {
  const explicitDestination = input.destination?.trim();
  if (explicitDestination) {
    return input;
  }
  const resolvedDestination = await resolvePreloadedDestinationHint({
    destination: input.destination,
    keyword: input.keyword,
  });
  if (!resolvedDestination) {
    return input;
  }
  return { ...input, destination: resolvedDestination };
}

async function hydrateVideosFromSummaryCache(
  videos: VideoRecommendation[],
): Promise<VideoRecommendation[]> {
  if (videos.length === 0) {
    return videos;
  }
  return Promise.all(
    videos.map(async (video) => {
      const videoId = video.videoId?.trim() || video.id?.trim();
      if (!videoId) {
        return video;
      }
      const cached = await getCachedVideoSummaryForVideoId(videoId);
      if (!cached) {
        return video;
      }
      return mergeCachedSummaryIntoVideo(video, cached);
    }),
  );
}

export async function getVideoRecommendations(
  input: RecommendationInput,
): Promise<VideoRecommendationOutcome> {
  const effectiveInput = await normalizeRecommendationInput(input);

  if (process.env.DISABLE_PRELOADED_DESTINATION_VIDEOS !== "true") {
    const preloaded = await getPreloadedDestinationVideos({
      destination: effectiveInput.destination,
      keyword: effectiveInput.keyword,
      limit: effectiveInput.limit,
      offset: effectiveInput.offset,
      excludeVideoIds: effectiveInput.excludeVideoIds,
    });
    if (preloaded && preloaded.length > 0) {
      const destinationScope = await resolveDestinationScopeForRecommendation(effectiveInput.destination);
      const scopedPreloaded = filterPreloadedVideosByScope(preloaded, destinationScope);
      if (scopedPreloaded.length > 0) {
        return {
          videos: await hydrateVideosFromSummaryCache(
            scopedPreloaded.map((video) => ({
              ...video,
              listProvenance: "preloaded-destination-seed",
            })),
          ),
          source: "preloaded-destination-seed",
          debug: {
            rawInput:
              buildVideoRecommendationSearchQuery({
                keyword: effectiveInput.keyword,
                destination: effectiveInput.destination,
              }) || "",
            searchQueries: [],
            executedQueries: [],
            regionCode: "TW",
            relevanceLanguage: "zh-Hant",
            selectedStrategy: "preloaded-seed",
            fallbackReasons: [],
            cacheStatus: "preloaded-hit",
          },
        };
      }
    }
  }

  if (serverConfig.enableMockVideoProvider) {
    const reason = "ENABLE_MOCK_VIDEO_PROVIDER is true; using local catalog.";
    console.warn(`[videoRecommendationService] ${reason}`);
    return {
      videos: getRelevantFallbackVideos(effectiveInput),
      source: "mock-fallback",
      fallbackReason: reason,
      debug: {
        rawInput:
          buildVideoRecommendationSearchQuery({
            keyword: effectiveInput.keyword,
            destination: effectiveInput.destination,
          }) || "",
        searchQueries: [],
        executedQueries: [],
        regionCode: "TW",
        relevanceLanguage: "zh-Hant",
        selectedStrategy: "high-intent",
        fallbackReasons: [reason],
      },
    };
  }

  try {
    const destinationScope = await resolveDestinationScopeForRecommendation(effectiveInput.destination);
    const providerResult = await searchYouTubeVideos({
      ...effectiveInput,
      destinationScope,
    });
    if (providerResult.provider === "youtube-data-api" && providerResult.videos.length > 0) {
      const ranked = rankRecommendedVideos(
        providerResult.videos.map((video): VideoCandidate => ({
          videoId: video.videoId || video.id,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          city: effectiveInput.destination,
          tags: [effectiveInput.destination || "", effectiveInput.keyword || "", ...(effectiveInput.preferences || [])].filter(Boolean),
          duration: video.duration,
          channelTitle: video.channelTitle,
        })),
        toPreference(effectiveInput),
        effectiveInput.limit || 6,
      );
      const byId = new Map(providerResult.videos.map((video) => [video.videoId || video.id, video]));
      return {
        videos: await hydrateVideosFromSummaryCache(
          ranked.map((video) => byId.get(video.videoId)).filter((video): video is VideoRecommendation => Boolean(video)),
        ),
        source: "youtube-data-api",
        debug: providerResult.debug,
      };
    }

    const reason =
      providerResult.fallbackReason || "YouTube Data API 未回傳可用結果。";
    console.info(`[videoRecommendationService] No YouTube results: ${reason}`);
    if (serverConfig.enableMockVideoProvider) {
      return {
        videos: getRelevantFallbackVideos(effectiveInput),
        source: "mock-fallback",
        fallbackReason: reason,
        debug: providerResult.debug,
      };
    }
    return {
      videos: [],
      source: "youtube-data-api",
      fallbackReason: reason,
      debug: providerResult.debug,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown YouTube API error.";
    console.warn(`[videoRecommendationService] YouTube API error: ${message}`);
    if (serverConfig.enableMockVideoProvider) {
      return {
        videos: getRelevantFallbackVideos(effectiveInput),
        source: "mock-fallback",
        fallbackReason: message,
        debug: {
          rawInput:
            buildVideoRecommendationSearchQuery({
              keyword: effectiveInput.keyword,
              destination: effectiveInput.destination,
            }) || "",
          searchQueries: [],
          executedQueries: [],
          regionCode: "TW",
          relevanceLanguage: "zh-Hant",
          selectedStrategy: "high-intent",
          fallbackReasons: [message],
        },
      };
    }
    return {
      videos: [],
      source: "youtube-data-api",
      fallbackReason: message,
      debug: {
        rawInput:
          buildVideoRecommendationSearchQuery({
            keyword: effectiveInput.keyword,
            destination: effectiveInput.destination,
          }) || "",
        searchQueries: [],
        executedQueries: [],
        regionCode: "TW",
        relevanceLanguage: "zh-Hant",
        selectedStrategy: "high-intent",
        fallbackReasons: [message],
      },
    };
  }
}
