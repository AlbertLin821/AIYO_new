import { apiPost } from "@/services/apiClient";
import type { ChatContext, ChatResponsePayload, TripPlanRequest, TripPlanResult } from "@/types";

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
}) {
  return apiPost<typeof input, TripPlanResult>("/api/ai/plan", input);
}
