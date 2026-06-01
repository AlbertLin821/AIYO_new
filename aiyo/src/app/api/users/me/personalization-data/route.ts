import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { clearAllPersonalizationData } from "@/server/personalization/personalizationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const { userId } = await requireSessionUser();
    const result = await clearAllPersonalizationData(userId);
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "無法清除個人化資料。"), { status: 500 });
  }
}
