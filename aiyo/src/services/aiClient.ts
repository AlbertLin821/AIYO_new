import { apiDelete, apiGet, apiPost, apiPut } from "@/services/apiClient";
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

export async function sendChatMessage(
  input: {
    message: string;
    messages?: ChatMessage[];
    context?: ChatContext;
    structuredTravelPlanning?: boolean;
    tripProfile?: TripProfile;
    questionAnswers?: ChatQuestionAnswer[];
    progressSessionId?: string;
  },
  options?: { signal?: AbortSignal },
) {
  const processId = startFrontendDebugProcess("chat-message", "送出聊天訊息", {
    progressSessionId: input.progressSessionId,
    structuredTravelPlanning: Boolean(input.structuredTravelPlanning),
    messagePreview: input.message.slice(0, 80),
  });
  try {
    const response = await apiPost<typeof input, ChatResponsePayload>("/api/ai/chat", input, {
      signal: options?.signal,
    });
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

export async function reviseTripPlan(
  input: {
    instruction: string;
    tripProfile: TripProfile;
    context?: ChatContext;
    progressSessionId?: string;
  },
  options?: { signal?: AbortSignal },
) {
  const processId = startFrontendDebugProcess("trip-revise", "修改既有行程", {
    progressSessionId: input.progressSessionId,
    instruction: input.instruction,
    destination: input.tripProfile.destination,
  });
  try {
    const response = await apiPost<typeof input, ChatResponsePayload>("/api/trip/revise", input, {
      signal: options?.signal,
    });
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
