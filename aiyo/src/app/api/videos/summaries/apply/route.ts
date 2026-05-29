import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { recordAppliedVideoSummary } from "@/server/personalization/personalizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as {
      tripId?: string;
      videoId?: string;
      summaryId?: string;
      videoUrl?: string;
      title?: string;
      appliedPlaces?: unknown;
      appliedSegments?: unknown;
      createdTripItems?: unknown;
      summarySnapshot?: unknown;
    };
    if (!body.videoId?.trim()) {
      return NextResponse.json(createError("invalid_request", "缺少 videoId。"), { status: 400 });
    }
    const result = await recordAppliedVideoSummary(userId, {
      tripId: body.tripId,
      videoId: body.videoId.trim(),
      summaryId: body.summaryId,
      videoUrl: body.videoUrl,
      title: body.title,
      appliedPlaces: body.appliedPlaces,
      appliedSegments: body.appliedSegments,
      createdTripItems: body.createdTripItems,
      summarySnapshot: body.summarySnapshot,
    });
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    if (error instanceof Error && error.message === "trip_not_owned") {
      return NextResponse.json(createError("forbidden", "指定行程不屬於目前使用者。"), { status: 403 });
    }
    return NextResponse.json(createError("internal_error", "無法記錄影片摘要套用。"), { status: 500 });
  }
}
