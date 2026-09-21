import assert from "node:assert/strict";
import { Worker } from "bullmq";
import { getMockVideoSummaryResult } from "../src/lib/mocks/videoSummaryResultFixture";
async function main() {
  process.env.AIYO_JOB_PREFIX = `aiyo-verification-${Date.now()}`;
  process.env.REDIS_URL = "redis://127.0.0.1:6379/0";
  const { videoQueue, submitVideoJob, readVideoJob, redisConnection, jobPrefix, VIDEO_QUEUE } = await import("../src/server/jobs/videoJobs");
  const input = { videoId: "BAyQ10iPK4M" };
  const first = await submitVideoJob("verification-owner", input);
  const second = await submitVideoJob("verification-owner", input);
  assert.equal(first.jobId, second.jobId);
  assert.equal(await readVideoJob("other-user", first.jobId), null);
  // Submit before any worker exists; Redis retains it until a worker starts.
  await videoQueue().waitUntilReady();
  const worker = new Worker(VIDEO_QUEUE, async (job) => {
    await job.updateProgress({ phase: "extract", label: "整理字幕", percent: 45 });
    return getMockVideoSummaryResult(job.data.input.videoId);
  }, { prefix: jobPrefix(), connection: redisConnection(true) });
  try {
    const deadline = Date.now() + 15000;
    let completed = false;
    while (Date.now() < deadline) {
      const status = await readVideoJob("verification-owner", first.jobId);
      if (status?.state === "completed") { assert.ok(status.result?.video); completed = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(completed);
    console.info("PASS: Redis job deduplication, owner isolation, delayed worker pickup, persisted result");
  } finally {
    await worker.close();
    await videoQueue().obliterate({ force: true }); // dedicated timestamped verification prefix only
    await videoQueue().close();
  }
}
void main().catch((error) => { console.error(error); process.exit(1); });
