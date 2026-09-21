import { loadProjectEnvIntoProcess } from "../src/lib/projectEnv";
loadProjectEnvIntoProcess(process.cwd(), { override: false });
async function main() {
  const { Worker } = await import("bullmq");
  const { VIDEO_QUEUE, redisConnection, jobPrefix } = await import("../src/server/jobs/videoJobs");
  const { summarizeVideo } = await import("../src/server/services/videoSummaryService");
  const { recordVideoInteraction } = await import("../src/server/personalization/personalizationService");
  const { MEMORY_QUEUE } = await import("../src/server/jobs/memoryJobs");
  const { addMemories } = await import("../src/server/memory/mem0Client");
  const memoryWorker = new Worker(MEMORY_QUEUE, (job) => addMemories(job.data), { connection: redisConnection(true), prefix: jobPrefix(), concurrency: 1 });
  memoryWorker.on("error", () => console.error("[memory-worker] connection unavailable"));
  const worker = new Worker(VIDEO_QUEUE, async (job) => {
    const result = await summarizeVideo({ ...job.data.input, onProgress: (progress) => job.updateProgress(progress) });
    await recordVideoInteraction(job.data.userId, { videoId: result.video.videoId || "", title: result.title,
      interactionType: "analyze", extractedPlaces: result.extractedLocations, metadata: { source: "video-worker" } }).catch(() => undefined);
    await job.updateProgress({ phase: "complete", label: "影片分析完成", percent: 100 });
    return result;
  }, { connection: redisConnection(true), prefix: jobPrefix(), concurrency: 1 });
  worker.on("error", () => console.error("[video-worker] connection unavailable"));
  worker.on("failed", (job) => console.error("[video-worker] job failed", job?.id));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, async () => { await Promise.all([worker.close(), memoryWorker.close()]); process.exit(0); });
  console.info("[video-worker] ready");
}
void main().catch(() => { console.error("[video-worker] startup failed"); process.exit(1); });
