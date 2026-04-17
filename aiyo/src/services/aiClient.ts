import { apiPost } from "@/services/apiClient";
import type { ChatContext, ChatResponsePayload, TripPlanRequest, TripPlanResult } from "@/types";

const VOICE_PLAN_TIMEOUT_MS = 28_000;

export async function sendChatMessage(input: {
  message: string;
  context?: ChatContext;
}) {
  return apiPost<typeof input, ChatResponsePayload>("/api/ai/chat", input);
}

export async function generatePlan(request: TripPlanRequest) {
  return apiPost<TripPlanRequest, TripPlanResult>("/api/ai/plan", request);
}

export async function generatePlanFromVoice(input: {
  transcript: string;
  destination?: string;
  days?: number;
  budget?: number;
  interests?: string[];
  transportPreference?: string;
}, options?: { signal?: AbortSignal; timeoutMs?: number }) {
  return apiPost<typeof input, TripPlanResult>("/api/ai/plan", input, {
    timeoutMs: options?.timeoutMs ?? VOICE_PLAN_TIMEOUT_MS,
    signal: options?.signal,
  });
}
