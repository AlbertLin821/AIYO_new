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
  const travelChatModel = resolveModelForTask("travel-chat");
  const videoSummaryModel = resolveModelForTask("video-summary");
  const videoSummaryFastModel = resolveModelForTask("video-summary-fast");
  const videoSummaryFinalModel = resolveModelForTask("video-summary-final");
  const locationFilterModel = resolveModelForTask("location-filter");
  const videoMomentPolishModel = resolveModelForTask("video-moment-polish");
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
          travelChatModel,
          videoSummaryModel,
          videoSummaryFastModel,
          videoSummaryFinalModel,
          locationFilterModel,
          videoMomentPolishModel,
          videoSegmentJsonPolish: serverConfig.ollamaVideoSegmentJsonPolish,
          videoLocationJsonFilter: serverConfig.ollamaVideoLocationJsonFilter,
          ollamaReachable: false,
          modelPresent: false,
          ollamaStatus: "error",
          httpStatus: response.status,
        }),
      );
    }

    const payload = (await response.json()) as OllamaTagsResponse;
    const names = new Set((payload.models || []).map((m) => m.name));
    const isModelPresent = (model: string) =>
      names.has(model) ||
      [...names].some((n) => n === model || n.startsWith(`${model}:`));
    const modelPresent = isModelPresent(tripPlanModel);

    return NextResponse.json(
      createSuccess({
        tripPlanModel,
        travelChatModel,
        videoSummaryModel,
        videoSummaryFastModel,
        videoSummaryFinalModel,
        locationFilterModel,
        videoMomentPolishModel,
        videoSegmentJsonPolish: serverConfig.ollamaVideoSegmentJsonPolish,
        videoLocationJsonFilter: serverConfig.ollamaVideoLocationJsonFilter,
        ollamaReachable: true,
        modelPresent,
        videoSummaryModelsPresent: {
          default: isModelPresent(videoSummaryModel),
          fast: isModelPresent(videoSummaryFastModel),
          final: isModelPresent(videoSummaryFinalModel),
          locationFilter: isModelPresent(locationFilterModel),
          videoMomentPolish: isModelPresent(videoMomentPolishModel),
        },
        ollamaStatus: modelPresent ? "ready" : "model_missing",
        modelCount: payload.models?.length ?? 0,
      }),
    );
  } catch {
    return NextResponse.json(
      createSuccess({
        tripPlanModel,
        travelChatModel,
        videoSummaryModel,
        videoSummaryFastModel,
        videoSummaryFinalModel,
        locationFilterModel,
        videoMomentPolishModel,
        videoSegmentJsonPolish: serverConfig.ollamaVideoSegmentJsonPolish,
        videoLocationJsonFilter: serverConfig.ollamaVideoLocationJsonFilter,
        ollamaReachable: false,
        modelPresent: false,
        ollamaStatus: "unreachable",
      }),
    );
  }
}
