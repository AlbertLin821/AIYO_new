import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { OllamaRequestError, resolveModelForTask } from "@/server/ai/ollamaClient";
import { checkOpenWebUiHealth, listOpenWebUiModels } from "@/server/ai/openWebUiClient";
import { scheduleOllamaWarmup } from "@/server/ai/ollamaModelWarmup";
import { requireSessionUser } from "@/server/auth";
import { serverConfig } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OllamaTagsResponse = {
  models?: Array<{ name: string; size?: number; modified_at?: string }>;
};

function matchesModel(available: Iterable<string>, model: string): boolean {
  for (const name of available) {
    if (name === model || name.startsWith(`${model}:`)) {
      return true;
    }
  }
  return false;
}

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
  const gatewayMode = serverConfig.openwebuiBaseUrl ? "open-webui" : "ollama";

  if (serverConfig.openwebuiBaseUrl) {
    try {
      const [healthy, modelNames] = await Promise.all([
        checkOpenWebUiHealth(),
        listOpenWebUiModels(),
      ]);
      const available = new Set(modelNames);
      const modelPresent = matchesModel(available, tripPlanModel);

      if (healthy && modelPresent) {
        scheduleOllamaWarmup();
      }

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
          ollamaReachable: healthy,
          modelPresent,
          videoSummaryModelsPresent: {
            default: matchesModel(available, videoSummaryModel),
            fast: matchesModel(available, videoSummaryFastModel),
            final: matchesModel(available, videoSummaryFinalModel),
            locationFilter: matchesModel(available, locationFilterModel),
            videoMomentPolish: matchesModel(available, videoMomentPolishModel),
          },
          ollamaStatus: !healthy ? "unreachable" : modelPresent ? "ready" : "model_missing",
          modelCount: modelNames.length,
          gatewayMode,
          gatewayBaseUrl: serverConfig.openwebuiBaseUrl,
        }),
      );
    } catch (error) {
      const httpStatus =
        error instanceof OllamaRequestError
          ? Number(/status (\d+)/i.exec(error.message)?.[1] || 0) || undefined
          : undefined;
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
          httpStatus,
          gatewayMode,
          gatewayBaseUrl: serverConfig.openwebuiBaseUrl,
        }),
      );
    }
  }

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
          gatewayMode,
        }),
      );
    }

    const payload = (await response.json()) as OllamaTagsResponse;
    const names = new Set((payload.models || []).map((m) => m.name));
    const modelPresent = matchesModel(names, tripPlanModel);

    if (modelPresent) {
      scheduleOllamaWarmup();
    }

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
          default: matchesModel(names, videoSummaryModel),
          fast: matchesModel(names, videoSummaryFastModel),
          final: matchesModel(names, videoSummaryFinalModel),
          locationFilter: matchesModel(names, locationFilterModel),
          videoMomentPolish: matchesModel(names, videoMomentPolishModel),
        },
        ollamaStatus: modelPresent ? "ready" : "model_missing",
        modelCount: payload.models?.length ?? 0,
        gatewayMode,
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
        gatewayMode,
      }),
    );
  }
}
