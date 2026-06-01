import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { recordVideoInteraction } from "@/server/personalization/personalizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as {
      videoId?: string;
      videoUrl?: string;
      title?: string;
      currentTripId?: string;
      analysisId?: string;
      summaryId?: string;
      extractedPlaces?: unknown;
      extractedTimestamps?: unknown;
      metadata?: Record<string, unknown>;
    };
    if (!body.videoId?.trim()) {
      return NextResponse.json(createError("invalid_request", "缺少 videoId。"), { status: 400 });
    }
    const result = await recordVideoInteraction(userId, {
      videoId: body.videoId.trim(),
      source: "youtube",
      videoUrl: body.videoUrl,
      title: body.title,
      tripId: body.currentTripId,
      interactionType: "analyze",
      analysisId: body.analysisId,
      summaryId: body.summaryId,
      extractedPlaces: body.extractedPlaces,
      extractedTimestamps: body.extractedTimestamps,
      metadata: body.metadata,
    });
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    if (error instanceof Error && error.message === "trip_not_owned") {
      return NextResponse.json(createError("forbidden", "指定行程不屬於目前使用者。"), { status: 403 });
    }
    return NextResponse.json(createError("internal_error", "無法記錄影片分析。"), { status: 500 });
  }
}
