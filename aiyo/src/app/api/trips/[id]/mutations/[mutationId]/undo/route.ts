import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { saveTripPayload } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";
import { undoAgentMutation } from "@/server/agent/mutationHistory";
import { mutationRequestSchema } from "@/server/agent/schemas";
import type { PersistedTripPayload } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; mutationId: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id, mutationId } = await context.params;
    await requireTripAccess(userId, id, "edit");
    const agentMutation = await prisma.tripMutation.findFirst({ where: { id: mutationId, tripId: id, source: "agent" }, select: { id: true } });
    if (agentMutation) {
      const parsed = mutationRequestSchema.safeParse(await request.json());
      if (!parsed.success) return NextResponse.json(createError("validation_error", "復原請求格式不正確。"), { status: 400 });
      const result = await undoAgentMutation(userId, id, mutationId, parsed.data.baseRevision, parsed.data.idempotencyKey);
      return NextResponse.json(createSuccess(result));
    }
    const mutation = await prisma.tripMutation.findFirst({ where: { id: mutationId, tripId: id, actorId: userId, source: "ai", undoneAt: null } });
    if (!mutation) return NextResponse.json(createError("not_found", "找不到可復原的 AI 修改。"), { status: 404 });
    const current = await prisma.trip.findUniqueOrThrow({ where: { id }, select: { revision: true } });
    if (current.revision !== mutation.resultRevision) return NextResponse.json(createError("version_conflict", "行程已有後續修改，不能直接復原。"), { status: 409 });
    const before = mutation.beforeSnapshot as unknown as PersistedTripPayload;
    const restored = await saveTripPayload(userId, { ...before, tripId: id, revision: current.revision, mutationSource: undefined });
    await prisma.tripMutation.update({ where: { id: mutation.id }, data: { undoneAt: new Date() } });
    return NextResponse.json(createSuccess({ trip: restored, revision: restored.revision }));
  } catch (error) { return toApiError(error, "復原行程失敗。"); }
}
