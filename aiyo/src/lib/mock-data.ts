import type { VideoRecommendation } from "@/types";

/**
 * 僅供 ENABLE_MOCK_VIDEO_PROVIDER 或 YouTube API 失敗時的後援清單。
 * 主流程預設應使用 YouTube Data API；UI 須標示為後援／示範來源。
 */
export const mockVideos: VideoRecommendation[] = [
  {
    id: "video_tokyo_1",
    title: "5 Days in Tokyo: neighborhoods, food stops, and efficient transit",
    thumbnail: "",
    url: "https://www.youtube.com/watch?v=tokyo001",
    duration: "18:32",
    summary:
      "A practical Tokyo planning video covering Asakusa, Shibuya, Tsukiji, Odaiba, and Shinjuku with route ideas and meal suggestions.",
    description:
      "Useful for building a first-time Tokyo trip with food, city views, and train-friendly movement.",
    source: "Mock YouTube",
    relevanceReason: "Matches Tokyo + food + efficient city planning",
    timestamps: [
      { time: "00:00", label: "Trip overview" },
      { time: "02:10", label: "Asakusa and Senso-ji" },
      { time: "06:00", label: "Shibuya crossing and cafes" },
      { time: "10:20", label: "Tsukiji lunch ideas" },
      { time: "14:10", label: "Odaiba sunset route" },
    ],
    summarySegments: [
      {
        id: "segment_tokyo_1",
        timestamp: "00:00",
        text: "Introduces the Tokyo route and transit mindset.",
        startLabel: "00:00",
        endLabel: "02:10",
        summary: "Introduces the Tokyo route and transit mindset.",
      },
      {
        id: "segment_tokyo_2",
        timestamp: "02:10",
        text: "Covers Asakusa, Senso-ji, and nearby breakfast spots.",
        startLabel: "02:10",
        endLabel: "06:00",
        summary: "Covers Asakusa, Senso-ji, and nearby breakfast spots.",
      },
      {
        id: "segment_tokyo_3",
        timestamp: "10:20",
        text: "Highlights Tsukiji and an afternoon move toward the bay area.",
        startLabel: "10:20",
        endLabel: "14:10",
        summary: "Highlights Tsukiji and an afternoon move toward the bay area.",
      },
    ],
    extractedLocations: [
      {
        name: "Senso-ji",
        lat: 35.7148,
        lng: 139.7967,
        description: "Historic temple district and easy morning start.",
        address: "2 Chome-3-1 Asakusa, Taito City, Tokyo",
      },
      {
        name: "Shibuya Crossing",
        lat: 35.6595,
        lng: 139.7005,
        description: "Dense shopping and cafe cluster for afternoon exploration.",
        address: "Shibuya City, Tokyo",
      },
      {
        name: "Tsukiji Outer Market",
        lat: 35.6655,
        lng: 139.7708,
        description: "Food-heavy district for seafood and small bites.",
        address: "4 Chome-16-2 Tsukiji, Chuo City, Tokyo",
      },
    ],
  },
  {
    id: "video_tokyo_2",
    title: "Tokyo cafe and design route for a relaxed 3-day city break",
    thumbnail: "",
    url: "https://www.youtube.com/watch?v=tokyo002",
    duration: "12:45",
    summary:
      "Focuses on cafe hopping, design shops, and lighter pacing around Omotesando, Daikanyama, and Shinjuku.",
    description:
      "Best for relaxed pacing and travelers who want more neighborhood texture than landmark volume.",
    source: "Mock YouTube",
    relevanceReason: "Good fit for relaxed pace and coffee interests",
    timestamps: [
      { time: "00:00", label: "Route intent" },
      { time: "03:00", label: "Omotesando coffee and design" },
      { time: "06:30", label: "Daikanyama walk" },
      { time: "09:10", label: "Shinjuku evening ideas" },
    ],
    summarySegments: [
      {
        id: "segment_tokyo_4",
        timestamp: "03:00",
        text: "Curates coffee shops and design stores in Omotesando.",
        startLabel: "03:00",
        endLabel: "06:30",
        summary: "Curates coffee shops and design stores in Omotesando.",
      },
    ],
    extractedLocations: [
      {
        name: "Omotesando",
        lat: 35.6653,
        lng: 139.7122,
        description: "Design-forward shopping and coffee area.",
        address: "Jingumae, Shibuya City, Tokyo",
      },
      {
        name: "Daikanyama",
        lat: 35.6482,
        lng: 139.7031,
        description: "Relaxed neighborhood with bookstores and cafes.",
        address: "Daikanyamacho, Shibuya City, Tokyo",
      },
      {
        name: "Shinjuku Gyoen",
        lat: 35.6852,
        lng: 139.71,
        description: "Good daylight anchor before an evening shift.",
        address: "11 Naitomachi, Shinjuku City, Tokyo",
      },
    ],
  },
  {
    id: "video_tokyo_3",
    title: "Tokyo night views and shopping route from Ginza to Odaiba",
    thumbnail: "",
    url: "https://www.youtube.com/watch?v=tokyo003",
    duration: "15:20",
    summary:
      "Pairs upscale shopping with bay-side evening views, useful for late-day itinerary design.",
    description:
      "A good complement when the user wants night scenery and shopping-heavy planning.",
    source: "Mock YouTube",
    relevanceReason: "Adds a night-view and shopping angle",
    timestamps: [
      { time: "00:00", label: "Ginza opening" },
      { time: "05:15", label: "TeamLab and Toyosu options" },
      { time: "10:30", label: "Odaiba night route" },
    ],
    summarySegments: [
      {
        id: "segment_tokyo_5",
        timestamp: "10:30",
        text: "Builds an evening route through the bay area for skyline views.",
        startLabel: "10:30",
        summary: "Builds an evening route through the bay area for skyline views.",
      },
    ],
    extractedLocations: [
      {
        name: "Ginza",
        lat: 35.6717,
        lng: 139.765,
        description: "Shopping district that transitions well into dinner.",
        address: "Ginza, Chuo City, Tokyo",
      },
      {
        name: "Toyosu",
        lat: 35.6484,
        lng: 139.7906,
        description: "Modern bay area with food and exhibition options.",
        address: "Toyosu, Koto City, Tokyo",
      },
      {
        name: "Odaiba",
        lat: 35.6266,
        lng: 139.7765,
        description: "Waterfront zone suited for a final evening stop.",
        address: "Daiba, Minato City, Tokyo",
      },
    ],
  },
];
