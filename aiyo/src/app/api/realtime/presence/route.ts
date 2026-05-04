import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { upsertPresence } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    let body: {
      roomId?: string;
      activeSection?: string;
      selectedEntityId?: string;
      cursorX?: number | null;
      cursorY?: number | null;
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      return NextResponse.json(createError("invalid_request", "Invalid JSON body."), { status: 400 });
    }
    if (!body.roomId) {
      return NextResponse.json(createError("invalid_request", "roomId is required."), { status: 400 });
    }
    await upsertPresence({
      roomId: body.roomId,
      userId,
      activeSection: body.activeSection,
      selectedEntityId: body.selectedEntityId,
      cursorX: body.cursorX,
      cursorY: body.cursorY,
    });
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    if (error instanceof Error && error.message === "presence_room_not_found") {
      return NextResponse.json(
        createError("invalid_request", "協作房間不存在或已失效，請重新整理頁面。"),
        { status: 404 },
      );
    }
    if (error instanceof Error && error.message === "presence_user_not_found") {
      return NextResponse.json(createError("unauthorized", "帳號不存在或已失效，請重新登入。"), {
        status: 401,
      });
    }
    if (process.env.NODE_ENV !== "production") {
      console.error("[api/realtime/presence]", error);
    }
    return NextResponse.json(createError("internal_error", "Failed to update presence."), { status: 500 });
  }
}
