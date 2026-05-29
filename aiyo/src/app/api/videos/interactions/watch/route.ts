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
      source?: string;
      videoUrl?: string;
      title?: string;
      watchDurationSeconds?: number;
      progress?: number;
      currentTripId?: string;
      metadata?: Record<string, unknown>;
    };
    if (!body.videoId?.trim()) {
      return NextResponse.json(createError("invalid_request", "缺少 videoId。"), { status: 400 });
    }
    const result = await recordVideoInteraction(userId, {
      videoId: body.videoId.trim(),
      source: body.source || "youtube",
      videoUrl: body.videoUrl,
      title: body.title,
      tripId: body.currentTripId,
      interactionType: "watch",
      watchDurationSeconds: body.watchDurationSeconds,
      progress: body.progress,
      metadata: body.metadata,
    });
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "無法記錄影片觀看。"), { status: 500 });
  }
}
