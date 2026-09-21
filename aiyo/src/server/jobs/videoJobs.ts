import { createHash } from "node:crypto";
import { Queue } from "bullmq";
import type { VideoJobInput, VideoJobStatus } from "@/lib/videoJob";
import type { VideoSummaryResult } from "@/types";
export const VIDEO_QUEUE = "video-analysis";
export function redisConnection(worker = false) {
  const url = new URL(process.env.REDIS_URL || "redis://127.0.0.1:6379/0");
  return { host: url.hostname, port: Number(url.port || 6379), username: url.username || undefined,
    password: decodeURIComponent(url.password) || undefined, db: Number(url.pathname.slice(1) || 0),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}), connectTimeout: 3000,
    retryStrategy: worker ? undefined : () => null,
    maxRetriesPerRequest: worker ? null : 1 };
}
export const jobPrefix = () => process.env.AIYO_JOB_PREFIX || "aiyo";
let queue: Queue<{ userId: string; input: VideoJobInput }, VideoSummaryResult> | undefined;
export function videoQueue() {
  if (!queue) {
    queue = new Queue(VIDEO_QUEUE, { connection: redisConnection(), prefix: jobPrefix(),
      defaultJobOptions: { attempts: 2, backoff: { type: "exponential", delay: 5000 },
        removeOnComplete: { age: 86400, count: 500 }, removeOnFail: { age: 86400, count: 500 } } });
    const created = queue;
    created.on("error", () => {
      console.warn("[video-queue] Redis unavailable");
      if (queue === created) queue = undefined;
    });
  }
  return queue;
}
export async function submitVideoJob(userId: string, input: VideoJobInput) {
  const id = createHash("sha256").update(JSON.stringify([userId, input])).digest("hex");
  const job = await videoQueue().add("summarize", { userId, input }, { deduplication: { id } });
  return { jobId: job.id!, ownerId: userId, state: "waiting", progress: { phase: "queued", label: "影片已排入分析佇列", percent: 0 } } satisfies VideoJobStatus;
}
export async function readVideoJob(userId: string, id: string): Promise<VideoJobStatus | null> {
  const job = await videoQueue().getJob(id);
  if (!job || job.data.userId !== userId) return null;
  const state = await job.getState();
  return { jobId: id, state,
    progress: typeof job.progress === "object" ? job.progress as VideoJobStatus["progress"] : { phase: "queued", label: "等待影片分析", percent: 0 },
    ...(state === "completed" ? { result: job.returnvalue } : {}),
    ...(state === "failed" ? { error: "影片分析失敗，請稍後重新分析。" } : {}) };
}
