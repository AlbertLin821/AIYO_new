import type { TranscriptEntry } from "@/server/providers/youtubeProvider";

/** 東京旅遊回歸：應拒絕泛用地名，保留具體 POI，拉麵為食物。 */
export const tokyoTravelTranscriptFixture: TranscriptEntry[] = [
  {
    timestamp: "00:08",
    startSeconds: 8,
    durationSeconds: 5,
    text: "東京旅遊今天開始，先在市區走走。",
  },
  {
    timestamp: "00:26",
    startSeconds: 26,
    durationSeconds: 5,
    text: "我們來到東京鐵塔拍照。",
  },
  {
    timestamp: "01:02",
    startSeconds: 62,
    durationSeconds: 5,
    text: "下一站東京車站買伴手禮。",
  },
  {
    timestamp: "01:50",
    startSeconds: 110,
    durationSeconds: 4,
    text: "淺草寺附近吃拉麵。",
  },
];
