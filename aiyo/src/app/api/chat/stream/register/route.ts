import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { ensureChatProgressSession } from "@/server/chat/chatProgressStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as { sessionId?: string };
    const sessionId = body.sessionId?.trim();
    if (!sessionId) {
      return NextResponse.json(createError("invalid_request", "缺少 sessionId。"), { status: 400 });
    }
    ensureChatProgressSession(sessionId, userId);
    return NextResponse.json(createSuccess({ sessionId }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "無法註冊進度串流。"), { status: 500 });
  }
}
