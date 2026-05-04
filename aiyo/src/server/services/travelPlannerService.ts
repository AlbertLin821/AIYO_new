import { chatWithOllama, OllamaRequestError, type OllamaMessage } from "@/server/ai/ollamaClient";
import {
  buildChatPrompt,
  buildItineraryPrompt,
  buildMapPlanningPrompt,
  detectResponseLanguage,
} from "@/server/ai/promptBuilder";
import { parseTripPlanResponse, StructuredOutputError } from "@/server/ai/responseParser";
import type {
  ChatContext,
  ChatMessage,
  ChatResponsePayload,
  TripPlanDay,
  TripPlanRequest,
  TripPlanResult,
} from "@/types";

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

function normalizeConversationHistory(messages?: ChatMessage[]): OllamaMessage[] {
  if (!messages?.length) {
    return [];
  }

  return messages
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "ai")
    .slice(-8)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));
}

function isCjk(text: string): boolean {
  return /[\u3400-\u9fff]/.test(text);
}

function buildFallbackTripPlan(request: TripPlanRequest): TripPlanResult {
  const chinese = isCjk(
    [request.destination, request.preferences.notes, request.preferences.interests.join(" ")]
      .filter(Boolean)
      .join(" "),
  );
  const mustVisit = request.preferences.mustVisit || [];
  const interests = request.preferences.interests || [];
  const lunchLabel = chinese ? "在地午餐" : "Local lunch";
  const dinnerLabel = chinese ? "晚餐與散步" : "Dinner and evening walk";
  const transportLabel = request.preferences.transportPreference || (chinese ? "大眾運輸" : "Public transit");
  const summary = chinese
    ? `${request.destination} ${request.days} 天行程已建立。此版本為模型格式失敗時的保底規劃，可直接再請 AI 微調。`
    : `Created a ${request.days}-day itinerary for ${request.destination}. This is a fallback plan used when the model response format is invalid.`;

  const themePool = chinese
    ? ["老城散步", "在地美食", "文化景點", "港灣與夜色", "市場巡遊"]
    : ["Old town walk", "Local food", "Culture stops", "Harbor evening", "Market route"];

  const interestPool = interests.length
    ? interests
    : chinese
      ? ["美食", "散步", "古蹟"]
      : ["food", "walking", "landmarks"];

  const days: TripPlanDay[] = Array.from({ length: request.days }, (_, index) => {
    const dayNumber = index + 1;
    const featuredStop = mustVisit[index] || mustVisit[0] || `${request.destination}${chinese ? "市區" : " city center"}`;
    const secondaryInterest = interestPool[index % interestPool.length];

    return {
      dayNumber,
      theme: `${themePool[index % themePool.length]}${chinese ? "" : ` ${dayNumber}`}`,
      summary: chinese
        ? `第 ${dayNumber} 天以 ${featuredStop} 與 ${secondaryInterest} 為主。`
        : `Day ${dayNumber} focuses on ${featuredStop} and ${secondaryInterest}.`,
      items: [
        {
          id: `fallback_${dayNumber}_1`,
          dayNumber,
          time: "09:00",
          title: featuredStop,
          type: "attraction",
          transport: transportLabel,
          notes: chinese
            ? `從 ${featuredStop} 開始，優先安排步行可串聯的區域。`
            : `Start from ${featuredStop} and keep the route spatially coherent.`,
          source: "ai",
        },
        {
          id: `fallback_${dayNumber}_2`,
          dayNumber,
          time: "12:00",
          title: chinese ? `${request.destination}${lunchLabel}` : `${request.destination} ${lunchLabel}`,
          type: "restaurant",
          transport: transportLabel,
          notes: chinese
            ? `依照 ${secondaryInterest} 偏好安排用餐與短暫休息。`
            : `Lunch stop aligned with the user's ${secondaryInterest} preference.`,
          source: "ai",
        },
        {
          id: `fallback_${dayNumber}_3`,
          dayNumber,
          time: "15:00",
          title: chinese ? `${secondaryInterest} 行程` : `${secondaryInterest} stop`,
          type: "activity",
          transport: transportLabel,
          notes: chinese
            ? "保留可彈性調整的停留時間，方便後續再用 AI 微調。"
            : "Leave buffer time so the itinerary can be refined later.",
          source: "ai",
        },
        {
          id: `fallback_${dayNumber}_4`,
          dayNumber,
          time: "18:30",
          title: chinese ? `${request.destination}${dinnerLabel}` : `${request.destination} ${dinnerLabel}`,
          type: "restaurant",
          transport: transportLabel,
          notes: chinese
            ? "晚上安排較輕鬆的收尾動線。"
            : "Use an easier evening route to close the day.",
          source: "ai",
        },
      ],
    };
  });

  return {
    summary,
    days,
    warnings: [
      chinese
        ? "AI 模型輸出格式異常，已改用保底行程模板。"
        : "The AI model returned invalid structured output, so a fallback itinerary template was used.",
    ],
  };
}

export async function generateTripPlan(
  request: TripPlanRequest,
  memoryContext?: string,
): Promise<{
  plan: TripPlanResult;
  diagnostics: {
    planGenerationMode: "model" | "fallback";
    parseMode: "direct" | "repaired" | "normalized" | "fallback";
    retryCount: number;
  };
}> {
  const requestMessages = [
    {
      role: "system" as const,
      content:
        "You generate structured travel itineraries. Output valid JSON only with realistic daily flows.",
    },
    {
      role: "user" as const,
      content: buildItineraryPrompt(request, memoryContext),
    },
  ];

  let raw: string;
  let retryCount = 0;
  try {
    raw = await chatWithOllama({
      format: "json",
      task: "trip-plan",
      messages: requestMessages,
    });
  } catch (error) {
    if (error instanceof OllamaRequestError) {
      retryCount += 1;
      try {
        raw = await chatWithOllama({
          format: "json",
          task: "trip-plan",
          messages: requestMessages,
        });
      } catch {
        const fallback = buildFallbackTripPlan(request);
        console.warn("[trip-plan] timeout,fallback");
        return {
          plan: fallback,
          diagnostics: {
            planGenerationMode: "fallback",
            parseMode: "fallback",
            retryCount,
          },
        };
      }
    } else {
      throw error;
    }
  }

  try {
    const parsed = parseTripPlanResponse(raw, request);
    console.info(`[trip-plan] parse_mode=${parsed.diagnostics.parseMode} retry_count=${retryCount}`);
    return {
      plan: parsed.result,
      diagnostics: {
        planGenerationMode: "model",
        parseMode: parsed.diagnostics.parseMode,
        retryCount,
      },
    };
  } catch (error) {
    if (!(error instanceof StructuredOutputError)) {
      throw error;
    }
    console.warn(
      `[trip-plan] parse_issue=${error.message === "MODEL_OUTPUT_JSON_MISSING" ? "json_missing" : "json_invalid"}`,
    );

    let retriedRaw: string;
    retryCount += 1;
    try {
      retriedRaw = await chatWithOllama({
        format: "json",
        task: "trip-plan",
        messages: [
          requestMessages[0],
          {
            role: "user",
            content: buildItineraryPrompt(request, memoryContext, {
              retryMode: "strict-format",
            }),
          },
        ],
      });
    } catch (retryModelError) {
      if (retryModelError instanceof OllamaRequestError) {
        try {
          retryCount += 1;
          retriedRaw = await chatWithOllama({
            format: "json",
            task: "trip-plan",
            messages: [
              requestMessages[0],
              {
                role: "user",
                content: buildItineraryPrompt(request, memoryContext, {
                  retryMode: "strict-format",
                }),
              },
            ],
          });
        } catch {
          const fallback = buildFallbackTripPlan(request);
          console.warn("[trip-plan] timeout,fallback");
          return {
            plan: fallback,
            diagnostics: {
              planGenerationMode: "fallback",
              parseMode: "fallback",
              retryCount,
            },
          };
        }
      } else {
        throw retryModelError;
      }
    }

    try {
      const parsed = parseTripPlanResponse(retriedRaw, request);
      if (parsed.diagnostics.parseMode === "normalized") {
        console.info("[trip-plan] normalized");
      }
      return {
        plan: parsed.result,
        diagnostics: {
          planGenerationMode: "model",
          parseMode: parsed.diagnostics.parseMode,
          retryCount,
        },
      };
    } catch (retryError) {
      if (!(retryError instanceof StructuredOutputError)) {
        throw retryError;
      }
      const fallback = buildFallbackTripPlan(request);
      console.warn(
        `[trip-plan] ${retryError.message === "MODEL_OUTPUT_JSON_MISSING" ? "json_missing" : "json_invalid"},fallback`,
      );
      return {
        plan: fallback,
        diagnostics: {
          planGenerationMode: "fallback",
          parseMode: "fallback",
          retryCount,
        },
      };
    }
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
  messages?: ChatMessage[];
  context?: ChatContext;
  memoryContext?: string;
}): Promise<ChatResponsePayload> {
  const language = detectResponseLanguage(input.message);
  const prompt = buildChatPrompt(input.message, input.context, input.memoryContext);
  const raw = await chatWithOllama({
    task: "travel-chat",
    messages: [
      { role: "system", content: prompt.system },
      ...normalizeHistory(input.context, language),
      ...normalizeConversationHistory(input.messages),
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
