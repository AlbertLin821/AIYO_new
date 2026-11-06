import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "view");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id }, select: { revision: true } });
    const latest = await prisma.tripMutation.findFirst({
      where: { tripId: id, actorId: userId, source: { in: ["agent", "agent_undo", "agent_redo"] }, resultRevision: trip.revision },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) return NextResponse.json(createSuccess({ action: null, revision: trip.revision }));
    if (latest.source === "agent") return NextResponse.json(createSuccess({ action: { mode: "undo", mutationId: latest.id }, revision: trip.revision }));
    if (latest.source === "agent_undo") {
      const ref = latest.operationsJson as { undoOf?: unknown } | null;
      if (typeof ref?.undoOf === "string") return NextResponse.json(createSuccess({ action: { mode: "redo", mutationId: ref.undoOf }, revision: trip.revision }));
    }
    return NextResponse.json(createSuccess({ action: null, revision: trip.revision }));
  } catch (error) { return toApiError(error, "無法載入修改記錄。"); }
}
