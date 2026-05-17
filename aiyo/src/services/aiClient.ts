import { apiDelete, apiGet, apiPost, apiPostWithMeta, apiPut } from "@/services/apiClient";
import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  startFrontendDebugProcess,
} from "@/lib/frontendDebug";
import type {
  ChatContext,
  ChatMessage,
  ChatSource,
  ChatQuestionAnswer,
  ChatResponsePayload,
  MemoryRecord,
  TripProfile,
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
  structuredTravelPlanning?: boolean;
  tripProfile?: TripProfile;
  questionAnswers?: ChatQuestionAnswer[];
  progressSessionId?: string;
}) {
  const processId = startFrontendDebugProcess("chat-message", "送出聊天訊息", {
    progressSessionId: input.progressSessionId,
    structuredTravelPlanning: Boolean(input.structuredTravelPlanning),
    messagePreview: input.message.slice(0, 80),
  });
  try {
    const response = await apiPost<typeof input, ChatResponsePayload>("/api/ai/chat", input);
    finishFrontendDebugProcess(processId, {
      replyType: response.reply.responseType || "unknown",
      replyId: response.reply.id,
    });
    return response;
  } catch (error) {
    failFrontendDebugProcess(processId, error, {
      progressSessionId: input.progressSessionId,
    });
    throw error;
  }
}

export async function reviseTripPlan(input: {
  instruction: string;
  tripProfile: TripProfile;
  context?: ChatContext;
  progressSessionId?: string;
}) {
  const processId = startFrontendDebugProcess("trip-revise", "修改既有行程", {
    progressSessionId: input.progressSessionId,
    instruction: input.instruction,
    destination: input.tripProfile.destination,
  });
  try {
    const response = await apiPost<typeof input, ChatResponsePayload>("/api/trip/revise", input);
    finishFrontendDebugProcess(processId, {
      replyType: response.reply.responseType || "unknown",
      replyId: response.reply.id,
    });
    return response;
  } catch (error) {
    failFrontendDebugProcess(processId, error, {
      progressSessionId: input.progressSessionId,
    });
    throw error;
  }
}

export async function fetchSourcePreview(sourceId: string): Promise<ChatSource> {
  return apiGet<ChatSource>(`/api/sources/${encodeURIComponent(sourceId)}/preview`);
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
  const processId = startFrontendDebugProcess("voice-plan", "語音行程規劃", {
    destination: input.destination,
    days: input.days,
    transcriptPreview: input.transcript.slice(0, 80),
  });
  try {
    const { data, meta } = await apiPostWithMeta<typeof input, TripPlanResult>("/api/ai/plan", input, {
      timeoutMs: options?.timeoutMs ?? VOICE_PLAN_CLIENT_TIMEOUT_MS,
      signal: options?.signal,
    });
    finishFrontendDebugProcess(processId, {
      days: data.days.length,
      meta,
    });
    return { plan: data, meta };
  } catch (error) {
    failFrontendDebugProcess(processId, error, {
      destination: input.destination,
    });
    throw error;
  }
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
