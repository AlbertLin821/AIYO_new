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
    await requireTripAccess(userId, id, "edit");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id }, select: { revision: true } });
    const mutation = await prisma.tripMutation.findFirst({
      where: { tripId: id, actorId: userId, source: "ai", resultRevision: trip.revision, undoneAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, resultRevision: true, createdAt: true },
    });
    return NextResponse.json(createSuccess({ mutation: mutation ? { ...mutation, createdAt: mutation.createdAt.toISOString() } : null, revision: trip.revision }));
  } catch (error) { return toApiError(error, "無法讀取復原資訊。"); }
}
