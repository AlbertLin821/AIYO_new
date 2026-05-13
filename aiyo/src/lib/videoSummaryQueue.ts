import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  logFrontendDebugEvent,
  startFrontendDebugProcess,
  updateFrontendDebugProcess,
  warnAndFinishFrontendDebugProcess,
} from "@/lib/frontendDebug";
import { shouldSkipClientVideoSummarize, summarizeVideo } from "@/services/videoClient";
import { useVideoStore } from "@/stores/useVideoStore";
import type { VideoRecommendation, VideoSummaryResult } from "@/types";

type VideoSummaryJob = {
  key: string;
  video: VideoRecommendation;
  destination?: string;
  background: boolean;
  resolve: (result: VideoSummaryResult) => void;
  reject: (error: unknown) => void;
};

const activeJobs = new Map<string, Promise<VideoSummaryResult>>();
const queue: VideoSummaryJob[] = [];
let isRunning = false;

function buildJobKey(video: VideoRecommendation, destination?: string): string {
  return [video.videoId || video.id, destination?.trim() || "any-destination"].join(":");
}

function applySummaryResult(result: VideoSummaryResult): void {
  const state = useVideoStore.getState();
  state.upsertVideo(result.video);

  if (state.selectedVideo?.videoId && state.selectedVideo.videoId === result.video.videoId) {
    state.setSelectedVideo(result.video);
    state.setSummaryDiagnostics({
      transcriptSource: result.transcriptSource,
      summarySource: result.summarySource,
      segmentSource: result.segmentSource,
      captionLanguage: result.debug?.captionLanguage,
      captionKind: result.debug?.captionKind,
      captionSource: result.debug?.captionSource,
      mapsProvenance: result.mapsProvenance,
      geocodeWarnings: result.geocodeWarnings,
      summaryUnavailable: result.summaryUnavailable,
      unavailableReason: result.unavailableReason,
    });
  }
}

async function runQueue(): Promise<void> {
  if (isRunning) {
    return;
  }
  isRunning = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) {
        continue;
      }

      const processId = startFrontendDebugProcess(
        job.background ? "video-summary-background" : "video-summary-foreground",
        job.background ? "背景分析旅遊影片" : "分析旅遊影片",
        {
          videoId: job.video.videoId,
          title: job.video.title,
          destination: job.destination,
          queueRemaining: queue.length,
        },
      );

      try {
        updateFrontendDebugProcess(processId, "pipeline-start", {
          videoId: job.video.videoId,
          title: job.video.title,
        });
        const result = await summarizeVideo({
          videoId: job.video.videoId,
          title: job.video.title,
          destination: job.destination,
          debug: false,
        });
        applySummaryResult(result);
        finishFrontendDebugProcess(processId, {
          videoId: result.video.videoId,
          title: result.video.title,
          cacheStatus: result.debug?.cacheStatus,
          locations: result.video.extractedLocations.length,
          foods: result.video.extractedFoods?.length || 0,
          segments: result.video.summarySegments?.length || 0,
          queueRemaining: queue.length,
        });
        job.resolve(result);
      } catch (error) {
        const failureMeta = {
          videoId: job.video.videoId,
          title: job.video.title,
          error: error instanceof Error ? error.message : String(error),
          queueRemaining: queue.length,
        };
        if (job.background) {
          warnAndFinishFrontendDebugProcess(processId, "prewarm-failed-will-retry-on-open", failureMeta);
        } else {
          failFrontendDebugProcess(processId, error, failureMeta);
        }
        job.reject(error);
      } finally {
        activeJobs.delete(job.key);
      }
    }
  } finally {
    isRunning = false;
  }
}

export function enqueueVideoSummary(
  video: VideoRecommendation,
  options?: {
    destination?: string;
    background?: boolean;
  },
): Promise<VideoSummaryResult> | null {
  if (shouldSkipClientVideoSummarize(video)) {
    logFrontendDebugEvent("video-summary-background", "skip-already-processed", {
      videoId: video.videoId,
      title: video.title,
      locations: video.extractedLocations.length,
      segments: video.summarySegments?.length || 0,
      foods: video.extractedFoods?.length || 0,
    });
    return null;
  }

  const key = buildJobKey(video, options?.destination);
  const existing = activeJobs.get(key);
  if (existing) {
    logFrontendDebugEvent("video-summary-background", "reuse-active-job", {
      videoId: video.videoId,
      title: video.title,
      key,
    });
    return existing;
  }

  const promise = new Promise<VideoSummaryResult>((resolve, reject) => {
    queue.push({
      key,
      video,
      destination: options?.destination,
      background: options?.background ?? true,
      resolve,
      reject,
    });
  });
  activeJobs.set(key, promise);
  logFrontendDebugEvent("video-summary-background", "queued", {
    videoId: video.videoId,
    title: video.title,
    key,
    queueLength: queue.length,
  });
  void runQueue();
  return promise;
}

export function enqueueVideoSummaries(
  videos: VideoRecommendation[],
  options?: {
    destination?: string;
  },
): void {
  videos.forEach((video) => {
    const job = enqueueVideoSummary(video, {
      destination: options?.destination,
      background: true,
    });
    job?.catch(() => {
      // Background prewarm failures are logged as warnings and retried when the video is opened.
    });
  });
}
