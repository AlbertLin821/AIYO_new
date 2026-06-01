import type { VideoRecommendation, VideoSummaryResult, VideoSummarySegment } from "@/types";

/**
 * Deterministic mock for `AIYO_VIDEO_SUMMARY_MOCK=1` and unit tests.
 * Includes timestamped segments with location hints (segment → place UX smoke).
 */
export function getMockVideoSummaryResult(videoId: string): VideoSummaryResult {
  const vid = videoId?.trim() || "mockVideoId";
  const segments: VideoSummarySegment[] = [
    {
      id: "mock-seg-1",
      timestamp: "02:30",
      startLabel: "02:30",
      endLabel: "04:10",
      startSeconds: 150,
      endSeconds: 250,
      text: "永康街與周邊散步、小吃與咖啡。",
      title: "永康街商圈",
      locationHints: ["永康街", "大安區"],
      summary: "介紹街廓動線與幾間在地小吃。",
      highlights: ["牛肉麵", "芒果冰"],
      timestampConfidence: "high",
      timestampSource: "youtube-transcript",
    },
    {
      id: "mock-seg-2",
      timestamp: "08:00",
      startLabel: "08:00",
      startSeconds: 480,
      endSeconds: 620,
      text: "象山步道與夜景。",
      title: "象山步道",
      locationHints: ["象山", "台北101"],
      summary: "健行路線與拍照點。",
      timestampConfidence: "high",
      timestampSource: "youtube-transcript",
    },
  ];

  const video: VideoRecommendation = {
    id: `mock_${vid}`,
    videoId: vid,
    title: "[Mock] 旅遊影片 — 時間戳與地點",
    thumbnail: `https://i.ytimg.com/vi/${vid}/hqdefault.jpg`,
    url: `https://www.youtube.com/watch?v=${encodeURIComponent(vid)}`,
    duration: "15:20",
    summary: "此為離線 mock 摘要：含可點擊時間軸與地點提示，方便驗證 UI。",
    description: "",
    source: "mock-connector",
    channelTitle: "AIYO Mock",
    timestamps: [
      { time: "02:30", label: "永康街商圈" },
      { time: "08:00", label: "象山步道" },
    ],
    summarySegments: segments,
    extractedLocations: [],
    extractedFoods: ["牛肉麵"],
    listProvenance: "mock-fallback",
  };

  return {
    source: "youtube-summary-service",
    transcriptSource: "youtube",
    summarySource: "ollama-transcript",
    segmentSource: "transcript-chunks",
    title: video.title,
    summary: video.summary,
    segments,
    extractedLocations: ["永康街", "象山"],
    extractedFoods: video.extractedFoods,
    summaryUnavailable: false,
    video,
    debug: {
      transcriptSource: "youtube",
      summarySource: "ollama-transcript",
      segmentSource: "transcript-chunks",
      cacheStatus: "miss",
      pipelineVersion: "mock",
    },
  };
}
