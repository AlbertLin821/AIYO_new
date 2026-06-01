import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { scheduleOllamaWarmup, collectOllamaWarmupModels } from "@/server/ai/ollamaModelWarmup";
import { requireSessionUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 背景預載常用 Ollama 模型（keep_alive），減少首次聊天冷啟動。 */
export async function POST() {
  try {
    await requireSessionUser();
  } catch {
    return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
  }

  scheduleOllamaWarmup();

  return NextResponse.json(
    createSuccess({
      scheduled: true,
      models: collectOllamaWarmupModels(),
    }),
  );
}
