import { isApiError } from "@/lib/api-response";
import type { ApiResponse, VideoSummaryResult } from "@/types";
import type { VideoJobStatus } from "@/lib/videoJob";
import { useVideoStore } from "@/stores/useVideoStore";
const storageKey = (ownerId: string) => `aiyo-video-jobs-v2:${ownerId}`;
let activeOwner: string | null = null;
export function setVideoJobOwner(ownerId: string | null) { activeOwner = ownerId; }
type SavedJob = { jobId: string; videoId: string; ownerId: string };
function saved(ownerId: string): SavedJob[] {
  try { const value = JSON.parse(localStorage.getItem(storageKey(ownerId)) || "[]"); return Array.isArray(value) ? value.filter((j) => j && typeof j.jobId === "string" && typeof j.videoId === "string" && j.ownerId === ownerId).slice(-30) : []; } catch { return []; }
}
function store(ownerId: string, jobs: SavedJob[]) { try { localStorage.setItem(storageKey(ownerId), JSON.stringify(jobs.slice(-30))); } catch { /* storage may be disabled */ } }
const active = new Map<string, Promise<VideoSummaryResult>>();
export function waitForVideoJob(job: SavedJob): Promise<VideoSummaryResult> {
  const key = `${job.ownerId}:${job.jobId}`;
  const existing = active.get(key);
  if (existing) return existing;
  store(job.ownerId, [...saved(job.ownerId).filter((item) => item.jobId !== job.jobId), job]);
  const assertOwner = () => { if (activeOwner !== job.ownerId) throw new Error("登入狀態已變更，重新登入原帳號後可恢復影片分析。"); };
  const forget = () => store(job.ownerId, saved(job.ownerId).filter((j) => j.jobId !== job.jobId));
  const promise = Promise.resolve().then(async () => {
    const deadline = Date.now() + 30 * 60_000;
    let transientFailures = 0;
    try {
      while (Date.now() < deadline) {
        assertOwner();
        let response: Response;
        let payload: ApiResponse<VideoJobStatus>;
        try {
          response = await fetch(`/api/videos/jobs/${encodeURIComponent(job.jobId)}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
          if (response.status >= 500 || response.status === 429) throw new Error("temporarily unavailable");
          payload = await response.json() as ApiResponse<VideoJobStatus>;
          transientFailures = 0;
        } catch {
          assertOwner();
          transientFailures += 1;
          if (transientFailures > 6) throw new Error("連線暫時中斷，影片仍在背景處理；重新開啟頁面可恢復進度。");
          await new Promise((resolve) => setTimeout(resolve, Math.min(10000, transientFailures * 1500)));
          continue;
        }
        assertOwner();
        if (!response.ok || isApiError(payload)) {
          if (response.status === 404) forget();
          throw new Error(isApiError(payload) ? payload.error.message : "無法取得影片分析進度");
        }
        const status = payload.data;
        useVideoStore.getState().setVideoJobProgress(job.videoId, status.progress.label);
        if (status.state === "completed" && status.result) {
          forget();
          return status.result;
        }
        if (status.state === "failed") {
          forget();
          throw new Error(status.error || "影片分析失敗，請重新分析。");
        }
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      throw new Error("影片仍在背景分析，稍後重新開啟頁面可繼續查看。");
    } finally {
      active.delete(key);
      if (activeOwner === job.ownerId) useVideoStore.getState().setVideoJobProgress(job.videoId, null);
    }
  });
  active.set(key, promise);
  return promise;
}
export function resumePendingVideoJobs(ownerId: string) {
  setVideoJobOwner(ownerId);
  for (const job of saved(ownerId)) {
    void waitForVideoJob(job).then((result) => {
      if (activeOwner !== ownerId) return;
      const state = useVideoStore.getState();
      state.upsertVideo(result.video);
      if (state.selectedVideo?.videoId === result.video.videoId) state.setSelectedVideo(result.video);
    }).catch((error) => { if (activeOwner === ownerId) useVideoStore.getState().setErrorMessage(error instanceof Error ? error.message : "影片分析失敗"); });
  }
}
