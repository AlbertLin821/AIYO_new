import { Queue } from "bullmq";
import { redisConnection, jobPrefix } from "./videoJobs";
import type { addMemories } from "@/server/memory/mem0Client";
import { serverConfig } from "@/server/config";
export const MEMORY_QUEUE = "memory-write";
let queue: Queue | undefined;
export async function enqueueMemoryWrite(input: Parameters<typeof addMemories>[0]) {
  if (!serverConfig.mem0Enabled || !input.messages.length) return;
  if (!queue) {
    queue = new Queue(MEMORY_QUEUE, { connection: redisConnection(), prefix: jobPrefix() });
    const created = queue;
    created.on("error", () => {
      console.warn("[memory-queue] Redis unavailable");
      if (queue === created) queue = undefined;
    });
  }
  await queue.add("write", input, { attempts: 3, backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true, removeOnFail: { age: 86400, count: 500 } });
}
