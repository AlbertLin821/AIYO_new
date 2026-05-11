import type { TranscriptEntry } from "@/server/providers/youtubeProvider";

/**
 * 固定嘉義兩天一夜美食情境逐字稿，用於 deterministic pipeline 驗收。
 * 含 generic 詞彙、別名「文化夜市」、具體 POI、純食物詞。
 */
export const chiayiFoodTranscriptFixture: TranscriptEntry[] = [
  {
    timestamp: "00:10",
    startSeconds: 10,
    durationSeconds: 5,
    text: "今天我們要來嘉義兩天一夜，找嘉義美食和嘉義景點。",
  },
  {
    timestamp: "00:35",
    startSeconds: 35,
    durationSeconds: 6,
    text: "我們現在來到文化路夜市，晚上這邊有很多小吃。",
  },
  {
    timestamp: "00:55",
    startSeconds: 55,
    durationSeconds: 6,
    text: "文化夜市這邊可以吃到火雞肉飯和砂鍋魚頭。",
  },
  {
    timestamp: "01:30",
    startSeconds: 90,
    durationSeconds: 7,
    text: "下一站是林聰明砂鍋魚頭，這間是嘉義很有名的老店。",
  },
  {
    timestamp: "02:20",
    startSeconds: 140,
    durationSeconds: 7,
    text: "接下來去民主火雞肉飯，很多人會點火雞肉飯。",
  },
  {
    timestamp: "03:10",
    startSeconds: 190,
    durationSeconds: 6,
    text: "下午可以去檜意森活村，這裡很好拍照。",
  },
  {
    timestamp: "04:00",
    startSeconds: 240,
    durationSeconds: 6,
    text: "旁邊也能安排北門驛和阿里山森林鐵路車庫園區。",
  },
  {
    timestamp: "05:00",
    startSeconds: 300,
    durationSeconds: 6,
    text: "最後如果還有時間，可以去嘉義公園走走。",
  },
];
