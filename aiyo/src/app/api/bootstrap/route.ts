import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { getBootstrapPayload } from "@/server/data/appStateService";
import { requireSessionUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const payload = await getBootstrapPayload(userId);
    return NextResponse.json(createSuccess(payload));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "unauthorized") {
        return NextResponse.json(
          createError("unauthorized", "尚未登入或登入已失效，請重新登入。"),
          { status: 401 },
        );
      }
      if (error.message === "missing_user") {
        // Happens when the database was reset/cleared but the browser still has a valid JWT cookie.
        return NextResponse.json(
          createError("unauthorized", "帳號不存在或已被清除，請重新登入。"),
          { status: 401 },
        );
      }
    }

    return NextResponse.json(
      createError("internal_error", "無法載入資料，請稍後再試。"),
      { status: 500 },
    );
  }
}
