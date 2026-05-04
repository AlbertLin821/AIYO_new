import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { resolveModelForTask } from "@/server/ai/ollamaClient";
import { requireSessionUser } from "@/server/auth";
import { serverConfig } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OllamaTagsResponse = {
  models?: Array<{ name: string; size?: number; modified_at?: string }>;
};

/**
 * 回傳目前行程規劃使用的模型名稱，以及 Ollama 服務是否可連線、該模型是否出現在本地標籤列表。
 */
export async function GET() {
  try {
    await requireSessionUser();
  } catch {
    return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
  }

  const tripPlanModel = resolveModelForTask("trip-plan");
  const baseUrl = serverConfig.ollamaBaseUrl.replace(/\/$/, "");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${baseUrl}/api/tags`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return NextResponse.json(
        createSuccess({
          tripPlanModel,
          ollamaReachable: false,
          modelPresent: false,
          ollamaStatus: "error",
          httpStatus: response.status,
        }),
      );
    }

    const payload = (await response.json()) as OllamaTagsResponse;
    const names = new Set((payload.models || []).map((m) => m.name));
    const modelPresent =
      names.has(tripPlanModel) ||
      [...names].some((n) => n === tripPlanModel || n.startsWith(`${tripPlanModel}:`));

    return NextResponse.json(
      createSuccess({
        tripPlanModel,
        ollamaReachable: true,
        modelPresent,
        ollamaStatus: modelPresent ? "ready" : "model_missing",
        modelCount: payload.models?.length ?? 0,
      }),
    );
  } catch {
    return NextResponse.json(
      createSuccess({
        tripPlanModel,
        ollamaReachable: false,
        modelPresent: false,
        ollamaStatus: "unreachable",
      }),
    );
  }
}
