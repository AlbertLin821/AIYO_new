import type { TranscriptEntry } from "@/server/providers/youtubeProvider";

export const youtubeOutlineTranscriptFixture: TranscriptEntry[] = [
  {
    timestamp: "00:00",
    startSeconds: 0,
    durationSeconds: 4,
    text: "今天我們來到嘉義市，先從文化路夜市開始。",
  },
  {
    timestamp: "00:04",
    startSeconds: 4,
    durationSeconds: 4,
    text: "今天我們來到嘉義市，先從文化路夜市開始。",
  },
  {
    timestamp: "00:18",
    startSeconds: 18,
    durationSeconds: 5,
    text: "接著走到郭家火雞肉飯，點一碗火雞肉飯。",
  },
  {
    timestamp: "00:42",
    startSeconds: 42,
    durationSeconds: 6,
    text: "下一站是林聰明砂鍋魚頭，砂鍋魚頭很適合晚餐。",
  },
  {
    timestamp: "01:20",
    startSeconds: 80,
    durationSeconds: 4,
    text: "這裡附近很多美食，嘉義真的很好玩。",
  },
];

export const youtubeOutlineExpectedPlaces = [
  "文化路夜市",
  "郭家火雞肉飯",
  "林聰明砂鍋魚頭",
];
