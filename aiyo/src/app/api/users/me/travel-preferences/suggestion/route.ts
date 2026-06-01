import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { getTravelPreferenceSuggestion } from "@/server/personalization/personalizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const suggestion = await getTravelPreferenceSuggestion(userId);
    return NextResponse.json(createSuccess(suggestion));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "無法讀取先前偏好。"), { status: 500 });
  }
}
