import type { VideoSummaryResult } from "@/types";
export type VideoJobInput = { url?: string; videoId?: string; title?: string; destination?: string; refresh?: boolean };
export type VideoJobProgress = { phase: string; label: string; percent: number };
export type VideoJobStatus = { jobId: string; ownerId?: string; state: string; progress: VideoJobProgress; result?: VideoSummaryResult; error?: string };
