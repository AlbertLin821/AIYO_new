import { resolveModelForTask } from "@/server/ai/ollamaClient";
import { serverConfig } from "@/server/config";

const WARMUP_PROMPT = ".";
const WARMUP_REQUEST_TIMEOUT_MS = 120_000;

let warmupInFlight: Promise<void> | null = null;

/** 從 env 與 task 解析出應預載的 Ollama 模型（去重）。 */
export function collectOllamaWarmupModels(): string[] {
  const models = new Set<string>();
  const tasks = [
    "travel-chat",
    "trip-plan",
    "video-summary",
    "location-filter",
    "video-summary-fast",
    "video-summary-final",
  ] as const;

  for (const task of tasks) {
    const name = resolveModelForTask(task).trim();
    if (name) {
      models.add(name);
    }
  }

  const videoExtract = serverConfig.ollamaVideoExtractModel.trim();
  if (videoExtract) {
    models.add(videoExtract);
  }

  return [...models];
}

export async function warmOllamaModel(model: string): Promise<boolean> {
  const trimmed = model.trim();
  if (!trimmed) {
    return false;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WARMUP_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${serverConfig.ollamaBaseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: trimmed,
        prompt: WARMUP_PROMPT,
        stream: false,
        keep_alive: serverConfig.ollamaKeepAlive,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** 依序預載常用模型，讓聊天／行程任務切換時少冷啟動。 */
export async function warmOllamaModels(models = collectOllamaWarmupModels()): Promise<void> {
  for (const model of models) {
    await warmOllamaModel(model);
  }
}

/** 非阻塞、全進程只排程一次。 */
export function scheduleOllamaWarmup(): void {
  if (warmupInFlight) {
    return;
  }
  warmupInFlight = warmOllamaModels()
    .catch((error) => {
      if (process.env.NODE_ENV !== "production") {
        console.warn("[ollama-warmup] failed", error instanceof Error ? error.message : error);
      }
    })
    .finally(() => {
      warmupInFlight = null;
    });
}
