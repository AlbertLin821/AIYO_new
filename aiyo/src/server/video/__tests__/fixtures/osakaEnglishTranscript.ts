import type { TranscriptEntry } from "@/server/providers/youtubeProvider";

/** 大阪英文情境：拒絕 Osaka／travel guide 類泛用詞，保留景點與市集。 */
export const osakaEnglishTranscriptFixture: TranscriptEntry[] = [
  {
    timestamp: "00:10",
    startSeconds: 10,
    durationSeconds: 5,
    text: "Osaka travel guide starts here today.",
  },
  {
    timestamp: "00:40",
    startSeconds: 40,
    durationSeconds: 5,
    text: "next stop is Osaka Castle",
  },
  {
    timestamp: "01:20",
    startSeconds: 80,
    durationSeconds: 6,
    text: "we visit Dotonbori and Kuromon Market for takoyaki",
  },
];
