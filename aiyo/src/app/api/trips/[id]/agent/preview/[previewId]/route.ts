import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string; previewId: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id, previewId } = await context.params;
    await requireTripAccess(userId, id, "view");
    const updated = await prisma.agentPreview.updateMany({ where: { id: previewId, tripId: id, actorId: userId, status: "pending" }, data: { status: "cancelled" } });
    if (!updated.count) return NextResponse.json(createError("not_found", "找不到待確認預覽。"), { status: 404 });
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) { return toApiError(error, "取消預覽失敗。"); }
}
