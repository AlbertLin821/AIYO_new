import { apiDelete, apiGet, apiPost, apiPostWithMeta, apiPut } from "@/services/apiClient";
import type {
  ChatContext,
  ChatMessage,
  ChatResponsePayload,
  MemoryRecord,
  TripPlanRequest,
  TripPlanResult,
} from "@/types";

/**
 * 語音／逐字稿行程規劃會觸發網搜、Mem0 與一或多輪 Ollama JSON（伺服端單輪最高約 120s）。
 * 28s 過短易誤判逾時；與 `OLLAMA_TIMEOUT_MS`、重試疊加後須留足緩衝。
 */
export const VOICE_PLAN_CLIENT_TIMEOUT_MS = 300_000;

export async function sendChatMessage(input: {
  message: string;
  messages?: ChatMessage[];
  context?: ChatContext;
}) {
  return apiPost<typeof input, ChatResponsePayload>("/api/ai/chat", input);
}

export async function generatePlan(request: TripPlanRequest) {
  return apiPost<TripPlanRequest, TripPlanResult>("/api/ai/plan", request);
}

export async function generatePlanFromVoice(
  input: {
    transcript: string;
    destination?: string;
    days?: number;
    budget?: number;
    interests?: string[];
    transportPreference?: string;
  },
  options?: { signal?: AbortSignal; timeoutMs?: number },
): Promise<{ plan: TripPlanResult; meta?: Record<string, unknown> }> {
  const { data, meta } = await apiPostWithMeta<typeof input, TripPlanResult>("/api/ai/plan", input, {
    timeoutMs: options?.timeoutMs ?? VOICE_PLAN_CLIENT_TIMEOUT_MS,
    signal: options?.signal,
  });
  return { plan: data, meta };
}

export async function fetchOllamaStatusForVoicePlan(): Promise<Record<string, unknown>> {
  try {
    return await apiGet<Record<string, unknown>>("/api/ai/ollama-status");
  } catch {
    return { ollamaStatus: "fetch_failed" };
  }
}

export async function listMemories() {
  return apiGet<MemoryRecord[]>("/api/memories");
}

export async function updateMemory(memoryId: string, text: string) {
  return apiPut<{ text: string }, MemoryRecord>(`/api/memories/${memoryId}`, { text });
}

export async function deleteMemory(memoryId: string) {
  return apiDelete<{ id: string }>(`/api/memories/${memoryId}`);
}
