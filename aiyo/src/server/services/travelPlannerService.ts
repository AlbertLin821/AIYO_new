import { chatWithOllama, type OllamaMessage } from "@/server/ai/ollamaClient";
import {
  buildChatPrompt,
  buildItineraryPrompt,
  buildMapPlanningPrompt,
  detectResponseLanguage,
} from "@/server/ai/promptBuilder";
import { parseTripPlanResponse, StructuredOutputError } from "@/server/ai/responseParser";
import type { ChatContext, ChatResponsePayload, TripPlanRequest, TripPlanResult } from "@/types";

function normalizeHistory(
  context?: ChatContext,
  language: "traditional-chinese" | "japanese" | "english" = "english",
): OllamaMessage[] {
  if (!context?.itinerary?.length) {
    return [];
  }

  const itinerarySummary = context.itinerary
    .map(
      (day) =>
        `Day ${day.dayNumber}: ${day.items
          .map((item) => `${item.time} ${item.title}`)
          .join(", ")}`,
    )
    .join("\n");

  return [
    {
      role: "assistant",
      content:
        language === "traditional-chinese"
          ? `目前行程脈絡：\n${itinerarySummary}`
          : language === "japanese"
            ? `現在の旅程コンテキスト:\n${itinerarySummary}`
            : `Current itinerary context:\n${itinerarySummary}`,
    },
  ];
}

export async function generateTripPlan(request: TripPlanRequest): Promise<TripPlanResult> {
  const requestMessages = [
    {
      role: "system" as const,
      content:
        "You generate structured travel itineraries. Output valid JSON only with realistic daily flows.",
    },
    {
      role: "user" as const,
      content: buildItineraryPrompt(request),
    },
  ];

  const raw = await chatWithOllama({
    format: "json",
    task: "trip-plan",
    messages: requestMessages,
  });

  try {
    return parseTripPlanResponse(raw, request);
  } catch (error) {
    if (!(error instanceof StructuredOutputError)) {
      throw error;
    }

    const retriedRaw = await chatWithOllama({
      format: "json",
      task: "trip-plan",
      messages: [
        requestMessages[0],
        {
          role: "user",
          content: `${buildItineraryPrompt(request)}\n\nThe previous answer was invalid JSON. Return only valid JSON matching the requested schema.`,
        },
      ],
    });

    return parseTripPlanResponse(retriedRaw, request);
  }
}

export async function buildMapPlanningNotes(request: TripPlanRequest): Promise<string> {
  return chatWithOllama({
    task: "travel-chat",
    messages: [
      {
        role: "system",
        content:
          "You summarize why a travel plan should be represented in a map view. Keep it concise.",
      },
      {
        role: "user",
        content: buildMapPlanningPrompt(request),
      },
    ],
  });
}

export async function chatWithTravelAssistant(input: {
  message: string;
  context?: ChatContext;
}): Promise<ChatResponsePayload> {
  const language = detectResponseLanguage(input.message);
  const prompt = buildChatPrompt(input.message, input.context);
  const raw = await chatWithOllama({
    task: "travel-chat",
    messages: [
      { role: "system", content: prompt.system },
      ...normalizeHistory(input.context, language),
      { role: "user", content: prompt.user },
    ],
  });

  return {
    reply: {
      id: `assistant_${Date.now()}`,
      role: "assistant",
      content: raw.trim(),
      timestamp: new Date().toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  };
}
