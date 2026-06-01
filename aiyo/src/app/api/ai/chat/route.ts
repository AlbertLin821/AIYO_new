import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { formatOllamaErrorMessage, OllamaRequestError } from "@/server/ai/ollamaClient";
import { buildPersonalizedAIContext, type AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { completeChatProgress, ensureChatProgressSession } from "@/server/chat/chatProgressStore";
import { addMemories, formatMemoryContext } from "@/server/memory/mem0Client";
import { isPersonalMemoryRecallIntent } from "@/server/memory/personalMemoryRecall";
import { retrieveRelevantMemoriesForUser } from "@/server/memory/memoryRetrieval";
import { requireSessionUser } from "@/server/auth";
import { resolveSessionTrip, saveChatMessage } from "@/server/data/appStateService";
import { chatWithTravelAssistant } from "@/server/services/travelPlannerService";
import type { ChatContext, ChatMessage, ChatQuestionAnswer, TripProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function logChatRouteFailure(messagePreview: string, error: unknown) {
  if (process.env.NODE_ENV === "production") {
    return;
  }
  const detail =
    error instanceof OllamaRequestError
      ? { kind: "ollama", message: error.message.slice(0, 240), isTimeout: error.isTimeout }
      : error instanceof Error
        ? { kind: error.name, message: error.message.slice(0, 240) }
        : { kind: "unknown", message: String(error).slice(0, 240) };
  console.error("[api/ai/chat] request failed", {
    messagePreview: messagePreview.slice(0, 80),
    ...detail,
  });
}

async function handleChatPost(request: Request) {
  let progressSessionId: string | undefined;
  let normalizedMessage = "";
  try {
    const body = (await request.json()) as {
      message?: string;
      displayMessage?: string;
      messages?: ChatMessage[];
      context?: ChatContext;
      structuredTravelPlanning?: boolean;
      tripProfile?: TripProfile;
      questionAnswers?: ChatQuestionAnswer[];
      progressSessionId?: string;
    };

    normalizedMessage = body.message?.trim() || "";
    const displayMessage = body.displayMessage?.trim() || "";
    const hasQuestionAnswers = Boolean(body.questionAnswers?.length);
    const userPersistContent = normalizedMessage || displayMessage;

    if (!normalizedMessage && !hasQuestionAnswers) {
      return NextResponse.json(createError("invalid_request", "訊息內容不能為空。"), {
        status: 400,
      });
    }

    progressSessionId = body.progressSessionId?.trim() || undefined;
    let persistedUserId: string | null = null;
    let persistedTripId: string | undefined;
    let memoryContext: string | undefined;
    let personalizedContext: AIContextBuildResult | null = null;
    let mem0Memories: string[] | undefined;

    try {
      const { userId } = await requireSessionUser();
      const trip = await resolveSessionTrip(userId);
      persistedUserId = userId;
      persistedTripId = trip?.id;
      if (progressSessionId) {
        ensureChatProgressSession(progressSessionId, userId);
      }
      if (userPersistContent) {
        await saveChatMessage(userId, "user", userPersistContent, persistedTripId);
        const recallIntent = isPersonalMemoryRecallIntent(userPersistContent);
        const { memories } = await retrieveRelevantMemoriesForUser({
          userId,
          query: userPersistContent,
          topK: recallIntent ? 20 : undefined,
          broadRecall: recallIntent,
        });
        const longTermMemory = formatMemoryContext(memories);
        personalizedContext = await buildPersonalizedAIContext({
          userId,
          currentUserInput: userPersistContent,
          chatContext: body.context,
          tripId: persistedTripId,
          memorySnippets: memories.map((memory) => ({
            content: memory.memory,
            source: "mem0",
            relevance: memory.score,
          })),
        });
        memoryContext = recallIntent
          ? longTermMemory
          : personalizedContext.promptContextText || longTermMemory;
        if (recallIntent) {
          mem0Memories = memories
            .map((memory) => memory.memory?.trim() || "")
            .filter(Boolean);
        }
      }
    } catch {
      // Chat remains functional even if the user is not authenticated.
    }

    if (progressSessionId && !persistedUserId) {
      return NextResponse.json(createError("unauthorized", "請先登入以使用行程規劃進度。"), {
        status: 401,
      });
    }

    const effectiveMessage = normalizedMessage || displayMessage;

    const response = await chatWithTravelAssistant({
      message: effectiveMessage,
      messages: body.messages,
      context: body.context,
      structuredTravelPlanning: body.structuredTravelPlanning,
      tripProfile: body.tripProfile,
      questionAnswers: body.questionAnswers,
      progressSessionId,
      memoryContext,
      mem0Memories,
      aiContext: personalizedContext,
    });

    if (persistedUserId) {
      try {
        await saveChatMessage(
          persistedUserId,
          response.reply.role,
          response.reply.content,
          persistedTripId,
          response.reply,
        );
      } catch {
        // Assistant reply persistence should not block the response.
      }

      try {
        await addMemories({
          userId: persistedUserId,
          messages: [
            { role: "user", content: userPersistContent || "[questionnaire_answers_submitted]" },
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

    if (process.env.NODE_ENV !== "production" && response.travelAgentDecision) {
      console.info("[api/ai/chat] travelAgentDecision", {
        mode: response.travelAgentDecision.mode,
        debugReason: response.travelAgentDecision.debugReason,
        messagePreview: effectiveMessage.slice(0, 80),
      });
    }

    if (progressSessionId) {
      completeChatProgress(progressSessionId);
    }

    return NextResponse.json(
      createSuccess(
        response,
        process.env.NODE_ENV !== "production" && personalizedContext
          ? {
              aiContextDebug: personalizedContext.debug,
            }
          : undefined,
      ),
    );
  } catch (error) {
    if (progressSessionId) {
      completeChatProgress(progressSessionId);
    }
    logChatRouteFailure(normalizedMessage, error);
    if (error instanceof OllamaRequestError) {
      return NextResponse.json(
        createError("ollama_error", formatOllamaErrorMessage(error, "travel-chat"), error.details),
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
