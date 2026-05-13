import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { OllamaRequestError } from "@/server/ai/ollamaClient";
import { completeChatProgress, ensureChatProgressSession } from "@/server/chat/chatProgressStore";
import { addMemories, formatMemoryContext, searchMemories } from "@/server/memory/mem0Client";
import { requireSessionUser } from "@/server/auth";
import { resolveSessionTrip, saveChatMessage } from "@/server/data/appStateService";
import { chatWithTravelAssistant } from "@/server/services/travelPlannerService";
import type { ChatContext, ChatMessage, ChatQuestionAnswer, TripProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function handleChatPost(request: Request) {
  let progressSessionId: string | undefined;
  try {
    const body = (await request.json()) as {
      message?: string;
      messages?: ChatMessage[];
      context?: ChatContext;
      structuredTravelPlanning?: boolean;
      tripProfile?: TripProfile;
      questionAnswers?: ChatQuestionAnswer[];
      progressSessionId?: string;
    };

    if (!body.message?.trim()) {
      return NextResponse.json(createError("invalid_request", "訊息內容不能為空。"), {
        status: 400,
      });
    }

    progressSessionId = body.progressSessionId?.trim() || undefined;
    if (progressSessionId) {
      ensureChatProgressSession(progressSessionId);
    }

    let persistedUserId: string | null = null;
    let persistedTripId: string | undefined;
    let memoryContext: string | undefined;

    try {
      const { userId } = await requireSessionUser();
      const trip = await resolveSessionTrip(userId);
      persistedUserId = userId;
      persistedTripId = trip.id;
      await saveChatMessage(userId, "user", body.message.trim(), trip.id);
      const memories = await searchMemories({
        userId,
        query: body.message.trim(),
      });
      memoryContext = formatMemoryContext(memories);
    } catch {
      // Chat remains functional even if the user is not authenticated.
    }

    const response = await chatWithTravelAssistant({
      message: body.message.trim(),
      messages: body.messages,
      context: body.context,
      structuredTravelPlanning: body.structuredTravelPlanning,
      tripProfile: body.tripProfile,
      questionAnswers: body.questionAnswers,
      progressSessionId,
      memoryContext,
    });

    if (persistedUserId) {
      try {
        await saveChatMessage(
          persistedUserId,
          response.reply.role,
          response.reply.content,
          persistedTripId,
        );
      } catch {
        // Assistant reply persistence should not block the response.
      }

      try {
        await addMemories({
          userId: persistedUserId,
          messages: [
            { role: "user", content: body.message.trim() },
            { role: "assistant", content: response.reply.content },
          ],
          metadata: {
            source: "aiyo-chat",
            tripId: persistedTripId,
          },
        });
      } catch {
        // Memory persistence should not block the response.
      }
    }

    if (progressSessionId) {
      completeChatProgress(progressSessionId);
    }

    return NextResponse.json(createSuccess(response));
  } catch (error) {
    if (progressSessionId) {
      completeChatProgress(progressSessionId);
    }
    if (error instanceof OllamaRequestError) {
      return NextResponse.json(
        createError("ollama_error", `Ollama 回應失敗：${error.message}`, error.details),
        { status: 502 },
      );
    }

    return NextResponse.json(
      createError("internal_error", "AI 對話請求失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return handleChatPost(request);
}
