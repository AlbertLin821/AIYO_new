import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { OllamaRequestError } from "@/server/ai/ollamaClient";
import { completeChatProgress, ensureChatProgressSession } from "@/server/chat/chatProgressStore";
import { formatMemoryContext, searchMemories } from "@/server/memory/mem0Client";
import { requireSessionUser } from "@/server/auth";
import { chatWithTravelAssistant } from "@/server/services/travelPlannerService";
import type { ChatContext, TripProfile } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let progressSessionId: string | undefined;
  try {
    const body = (await request.json()) as {
      instruction?: string;
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
    if (progressSessionId) {
      ensureChatProgressSession(progressSessionId);
    }

    let memoryContext: string | undefined;
    try {
      const { userId } = await requireSessionUser();
      const memories = await searchMemories({
        userId,
        query: [body.tripProfile.destination || "", body.instruction.trim()].filter(Boolean).join(" "),
      });
      memoryContext = formatMemoryContext(memories);
    } catch {
      // Revision still works without an authenticated memory lookup.
    }

    const response = await chatWithTravelAssistant({
      message: body.instruction.trim(),
      context: body.context,
      structuredTravelPlanning: true,
      tripProfile: body.tripProfile,
      progressSessionId,
      memoryContext,
    });

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
      createError("internal_error", "重新生成行程失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}
