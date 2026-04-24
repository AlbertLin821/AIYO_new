import { mockVideos } from "@/lib/mock-data";
import {
  rankRecommendedVideos,
  type UserTravelPreference,
  type VideoCandidate,
} from "@/lib/recommendation";
import { serverConfig } from "@/server/config";
import {
  buildVideoRecommendationSearchQuery,
  isTravelRelatedVideo,
} from "@/server/providers/travelVideoFilter";
import { searchYouTubeVideos, type VideoSearchDebugInfo } from "@/server/providers/youtubeProvider";
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
}

export type VideoRecommendationOutcome = {
  videos: VideoRecommendation[];
  source: "youtube-data-api" | "mock-fallback";
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
    .slice(0, Math.max(1, Math.min(input.limit || 10, 12)))
    .map((entry) => entry.video);
}

const taiwanCityFallbackVideos: Array<VideoRecommendation & {
  city: string;
  tags: string[];
  viewCount: number;
}> = [
  {
    id: "taiwan_taipei_1",
    videoId: "taipei_travel_001",
    title: "台北三日遊景點美食懶人包：捷運路線、夜市與文青街區",
    thumbnail: "https://i.ytimg.com/vi/taipei_travel_001/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=taipei_travel_001",
    duration: "12:40",
    summary: "台北捷運友善路線，涵蓋夜市、老街、展覽與城市散步。",
    description: "台北 旅遊 景點 美食 夜市 文青 三日遊",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：台北城市旅遊與美食密度高。",
    timestamps: [],
    extractedLocations: [],
    summarySegments: [],
    listProvenance: "mock-fallback",
    city: "台北",
    tags: ["台北", "美食", "夜市", "文青", "三日遊"],
    viewCount: 320000,
  },
  {
    id: "taiwan_newtaipei_1",
    videoId: "newtaipei_travel_001",
    title: "新北一日到兩天一夜：九份、淡水、山海景點攻略",
    thumbnail: "https://i.ytimg.com/vi/newtaipei_travel_001/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=newtaipei_travel_001",
    duration: "14:12",
    summary: "串起九份、淡水與東北角的山海景點，適合週末短旅行。",
    description: "新北 旅遊 景點 九份 淡水 山海 兩天一夜",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：新北能補足山海線與老街體驗。",
    timestamps: [],
    extractedLocations: [],
    summarySegments: [],
    listProvenance: "mock-fallback",
    city: "新北",
    tags: ["新北", "景點", "自然", "老街"],
    viewCount: 210000,
  },
  {
    id: "taiwan_taoyuan_1",
    videoId: "taoyuan_travel_001",
    title: "桃園親子景點與老街美食：兩天一夜輕鬆行程",
    thumbnail: "https://i.ytimg.com/vi/taoyuan_travel_001/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=taoyuan_travel_001",
    duration: "10:58",
    summary: "桃園親子景點、老街小吃與埤塘散步，節奏輕鬆。",
    description: "桃園 旅遊 親子 景點 老街 美食 兩天一夜",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：桃園適合親子與短天數安排。",
    timestamps: [],
    extractedLocations: [],
    summarySegments: [],
    listProvenance: "mock-fallback",
    city: "桃園",
    tags: ["桃園", "親子", "美食", "兩天一夜"],
    viewCount: 145000,
  },
  {
    id: "taiwan_taichung_1",
    videoId: "taichung_travel_001",
    title: "台中美食兩日遊：審計新村、歌劇院、夜市與咖啡",
    thumbnail: "https://i.ytimg.com/vi/taichung_travel_001/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=taichung_travel_001",
    duration: "16:20",
    summary: "台中兩日遊路線，混合文青街區、建築景點、夜市與咖啡店。",
    description: "台中 美食 旅遊 景點 文青 咖啡 兩日遊",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：台中適合美食、咖啡與文青景點。",
    timestamps: [],
    extractedLocations: [],
    summarySegments: [],
    listProvenance: "mock-fallback",
    city: "台中",
    tags: ["台中", "美食", "文青", "咖啡", "兩日遊"],
    viewCount: 380000,
  },
  {
    id: "taiwan_tainan_1",
    videoId: "tainan_travel_001",
    title: "台南三日遊：古蹟、美食、文青景點完整懶人包",
    thumbnail: "https://i.ytimg.com/vi/tainan_travel_001/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=tainan_travel_001",
    duration: "18:06",
    summary: "台南三日遊聚焦小吃、古蹟、巷弄散步與文青景點。",
    description: "台南 三日遊 美食 古蹟 文青 景點 懶人包",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：台南與美食、古蹟、文青偏好高度相關。",
    timestamps: [],
    extractedLocations: [],
    summarySegments: [],
    listProvenance: "mock-fallback",
    city: "台南",
    tags: ["台南", "三日遊", "美食", "古蹟", "文青"],
    viewCount: 520000,
  },
  {
    id: "taiwan_kaohsiung_1",
    videoId: "kaohsiung_travel_001",
    title: "高雄港都兩天一夜：駁二、西子灣、夜市與親子景點",
    thumbnail: "https://i.ytimg.com/vi/kaohsiung_travel_001/hqdefault.jpg",
    url: "https://www.youtube.com/watch?v=kaohsiung_travel_001",
    duration: "13:32",
    summary: "高雄港灣景點、輕軌路線、夜市與親子友善景點。",
    description: "高雄 旅遊 景點 夜市 親子 港都 兩天一夜",
    source: "mock-fallback",
    relevanceReason: "六都空白狀態推薦：高雄適合港灣景色、夜市與親子安排。",
    timestamps: [],
    extractedLocations: [],
    summarySegments: [],
    listProvenance: "mock-fallback",
    city: "高雄",
    tags: ["高雄", "夜市", "親子", "景點", "兩天一夜"],
    viewCount: 275000,
  },
];

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
    input.limit || 6,
  );

  const byId = new Map(taiwanCityFallbackVideos.map((video) => [video.videoId, video]));
  return ranked.map((scored) => {
    const source = byId.get(scored.videoId) || taiwanCityFallbackVideos[0];
    return {
      ...source,
      relevanceReason: `${source.relevanceReason} 推薦分數 ${scored.score}。`,
    };
  });
}

export async function getVideoRecommendations(
  input: RecommendationInput,
): Promise<VideoRecommendationOutcome> {
  if (serverConfig.enableMockVideoProvider) {
    const reason = "ENABLE_MOCK_VIDEO_PROVIDER is true; using local catalog.";
    console.warn(`[videoRecommendationService] ${reason}`);
    return {
      videos: input.destination || input.keyword || input.preferences?.length
        ? rankTaiwanCityFallbackVideos(input)
        : rankTaiwanCityFallbackVideos({ ...input, limit: 6 }),
      source: "mock-fallback",
      fallbackReason: reason,
      debug: {
        rawInput:
          buildVideoRecommendationSearchQuery({
            keyword: input.keyword,
            destination: input.destination,
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
    const providerResult = await searchYouTubeVideos(input);
    if (providerResult.provider === "youtube-data-api" && providerResult.videos.length > 0) {
      const ranked = rankRecommendedVideos(
        providerResult.videos.map((video): VideoCandidate => ({
          videoId: video.videoId || video.id,
          title: video.title,
          description: video.description,
          publishedAt: video.publishedAt,
          city: input.destination,
          tags: [input.destination || "", input.keyword || "", ...(input.preferences || [])].filter(Boolean),
          duration: video.duration,
          channelTitle: video.channelTitle,
        })),
        toPreference(input),
        input.limit || 6,
      );
      const byId = new Map(providerResult.videos.map((video) => [video.videoId || video.id, video]));
      return {
        videos: ranked.map((video) => byId.get(video.videoId)).filter((video): video is VideoRecommendation => Boolean(video)),
        source: "youtube-data-api",
        debug: providerResult.debug,
      };
    }

    const reason =
      providerResult.fallbackReason || "YouTube Data API 未回傳可用結果。";
    console.warn(`[videoRecommendationService] No YouTube results: ${reason}`);
    if (serverConfig.enableMockVideoProvider || providerResult.provider === "mock") {
      return {
        videos: rankTaiwanCityFallbackVideos(input).length
          ? rankTaiwanCityFallbackVideos(input)
          : rankFallbackVideos(input),
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
        videos: rankTaiwanCityFallbackVideos(input).length
          ? rankTaiwanCityFallbackVideos(input)
          : rankFallbackVideos(input),
        source: "mock-fallback",
        fallbackReason: message,
        debug: {
          rawInput:
            buildVideoRecommendationSearchQuery({
              keyword: input.keyword,
              destination: input.destination,
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
            keyword: input.keyword,
            destination: input.destination,
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
