import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { buildPersonalizedAIContext, type AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { OllamaRequestError } from "@/server/ai/ollamaClient";
import { completeChatProgress, ensureChatProgressSession } from "@/server/chat/chatProgressStore";
import { formatMemoryContext } from "@/server/memory/mem0Client";
import { enqueueMemoryWrite } from "@/server/jobs/memoryJobs";
import { retrieveRelevantMemoriesForUser } from "@/server/memory/memoryRetrieval";
import { guardDestructiveChatMessage } from "@/server/ai/destructiveConfirmation";
import { requireSessionUser } from "@/server/auth";
import { resolveSessionTrip, saveChatMessage } from "@/server/data/appStateService";
import { loadAuthorizedChatContext } from "@/server/ai/chatTripContext";
import { chatWithTravelAssistant } from "@/server/services/travelPlannerService";
import type { ChatContext, TripProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let progressSessionId: string | undefined;
  try {
    const body = (await request.json()) as {
      instruction?: string;
      tripId?: string;
      tripProfile?: TripProfile;
      context?: ChatContext;
      progressSessionId?: string;
    };

    if (!body.instruction?.trim()) {
      return NextResponse.json(
        createError("invalid_request", "修改指令不能為空。"),
        { status: 400 },
      );
    }

    if (!body.tripProfile) {
      return NextResponse.json(
        createError("invalid_request", "缺少 TripProfile，無法重新生成行程。"),
        { status: 400 },
      );
    }

    progressSessionId = body.progressSessionId?.trim() || undefined;
    const requestedTripId = body.tripId?.trim() || undefined;
    let requestedTripValidated = false;

    let memoryContext: string | undefined;
    let personalizedContext: AIContextBuildResult | null = null;
    let persistedUserId: string | null = null;
    let persistedTripId: string | undefined;
    let authoritativeContext = body.context;
    try {
      const { userId } = await requireSessionUser();
      if (requestedTripId) authoritativeContext = await loadAuthorizedChatContext(userId, requestedTripId, body.context);
      requestedTripValidated = true;
      const trip = requestedTripId ? { id: requestedTripId } : await resolveSessionTrip(userId);
      persistedUserId = userId;
      persistedTripId = trip?.id;
      if (progressSessionId) {
        ensureChatProgressSession(progressSessionId, userId);
      }
      await saveChatMessage(userId, "user", body.instruction.trim(), persistedTripId);
      const { memories } = await retrieveRelevantMemoriesForUser({
        userId,
        query: [body.tripProfile.destination || "", body.instruction.trim()].filter(Boolean).join(" "),
      });
      personalizedContext = await buildPersonalizedAIContext({
        userId,
        currentUserInput: body.instruction.trim(),
        chatContext: authoritativeContext,
        tripId: persistedTripId,
        memorySnippets: memories.map((memory) => ({
          content: memory.memory,
          source: "mem0",
          relevance: memory.score,
        })),
      });
      memoryContext = personalizedContext.promptContextText || formatMemoryContext(memories);
    } catch (error) {
      if (error instanceof Error && error.message === "forbidden") return NextResponse.json(createError("forbidden", "無法讀取這份行程。"), { status: 403 });
      if (error instanceof Error && error.message === "not_found") return NextResponse.json(createError("not_found", "找不到這份行程。"), { status: 404 });
      if (requestedTripId && !persistedUserId) return NextResponse.json(createError("unauthorized", "請先登入以讀取行程。"), { status: 401 });
      if (requestedTripId && !requestedTripValidated) throw error;
      // Revision still works without an authenticated memory lookup.
    }

    const destructiveGuard = guardDestructiveChatMessage({
      userId: persistedUserId,
      tripId: persistedTripId,
      message: body.instruction.trim(),
      context: authoritativeContext,
    });
    if (destructiveGuard.kind === "respond") {
      if (persistedUserId) {
        await saveChatMessage(
          persistedUserId,
          destructiveGuard.response.reply.role,
          destructiveGuard.response.reply.content,
          persistedTripId,
          destructiveGuard.response.reply,
        ).catch(() => undefined);
      }
      if (progressSessionId) {
        completeChatProgress(progressSessionId);
      }
      return NextResponse.json(createSuccess(destructiveGuard.response));
    }

    const response = await chatWithTravelAssistant({
      message: body.instruction.trim(),
      context: authoritativeContext,
      structuredTravelPlanning: true,
      tripProfile: body.tripProfile,
      progressSessionId,
      memoryContext,
      forceStructuredRevision: true,
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
        await enqueueMemoryWrite({
          userId: persistedUserId,
          messages: [
            { role: "user", content: body.instruction.trim() },
            { role: "assistant", content: response.reply.content },
          ],
          metadata: {
            source: "aiyo-trip-revise",
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

    return NextResponse.json(
      createSuccess(
        response,
        process.env.NODE_ENV !== "production" && personalizedContext
          ? { aiContextDebug: personalizedContext.debug }
          : undefined,
      ),
    );
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
      createError("internal_error", "重新生成行程失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}
