import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { OllamaRequestError } from "@/server/ai/ollamaClient";
import { requireSessionUser } from "@/server/auth";
import { ensureCurrentTrip, saveChatMessage } from "@/server/data/appStateService";
import { chatWithTravelAssistant } from "@/server/services/travelPlannerService";
import type { ChatContext } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      message?: string;
      context?: ChatContext;
    };

    if (!body.message?.trim()) {
      return NextResponse.json(createError("invalid_request", "訊息內容不能為空。"), {
        status: 400,
      });
    }

    let persistedUserId: string | null = null;
    let persistedTripId: string | undefined;

    try {
      const { userId } = await requireSessionUser();
      const trip = await ensureCurrentTrip(userId);
      persistedUserId = userId;
      persistedTripId = trip.id;
      await saveChatMessage(userId, "user", body.message.trim(), trip.id);
    } catch {
      // Chat remains functional even if the user is not authenticated.
    }

    const response = await chatWithTravelAssistant({
      message: body.message.trim(),
      context: body.context,
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
    }

    return NextResponse.json(createSuccess(response));
  } catch (error) {
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
