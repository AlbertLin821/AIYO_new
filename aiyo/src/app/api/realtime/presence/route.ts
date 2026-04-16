import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { upsertPresence } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as {
      roomId?: string;
      activeSection?: string;
      selectedEntityId?: string;
    };
    if (!body.roomId) {
      return NextResponse.json(createError("invalid_request", "roomId is required."), { status: 400 });
    }
    await upsertPresence({
      roomId: body.roomId,
      userId,
      activeSection: body.activeSection,
      selectedEntityId: body.selectedEntityId,
    });
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to update presence."), { status: 500 });
  }
}
