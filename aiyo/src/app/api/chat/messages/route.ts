import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { clearUserChatMessages } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE() {
  try {
    const { userId } = await requireSessionUser();
    const cleared = await clearUserChatMessages(userId);
    return NextResponse.json(createSuccess({ cleared }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(
        createError("unauthorized", "尚未登入或登入已失效，請重新登入。"),
        { status: 401 },
      );
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[api/chat/messages] DELETE internal_error", error);
    }
    return NextResponse.json(
      createError("internal_error", "無法清除對話紀錄，請稍後再試。"),
      { status: 500 },
    );
  }
}
