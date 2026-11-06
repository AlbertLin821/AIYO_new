import { NextResponse } from "next/server";
import { canCollaborator, type CollaboratorRole } from "@/lib/permissions";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { applySnapshotPatch } from "@/server/agent/snapshotPatch";
import { agentProposalSchema, mutationRequestSchema } from "@/server/agent/schemas";
import { observeAgentApi } from "@/server/agent/apiTelemetry";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { serializeTrip } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";
import type { PersistedTripPayload } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; previewId: string }> }) {
  return observeAgentApi("apply", () => applyPreview(request, context));
}

async function applyPreview(request: Request, context: { params: Promise<{ id: string; previewId: string }> }) {
  let replayContext: { userId: string; tripId: string; previewId: string; idempotencyKey: string } | null = null;
  try {
    const { userId } = await requireSessionUser();
    const { id, previewId } = await context.params;
    await requireTripAccess(userId, id, "edit");
    const parsed = mutationRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(createError("validation_error", "確認預覽輸入格式不正確。"), { status: 400 });
    const { baseRevision, idempotencyKey } = parsed.data;
    replayContext = { userId, tripId: id, previewId, idempotencyKey };
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${previewId}))::text`;
      const duplicate = await tx.tripMutation.findUnique({ where: { tripId_idempotencyKey: { tripId: id, idempotencyKey } } });
      if (duplicate) {
        const recorded = duplicate.operationsJson as { previewId?: unknown } | null;
        if (duplicate.actorId !== userId || duplicate.source !== "agent" || recorded?.previewId !== previewId) throw new Error("idempotency_conflict");
        const stored = duplicate.afterSnapshot as unknown as PersistedTripPayload;
        return { trip: stored, revision: duplicate.resultRevision, mutationId: duplicate.id };
      }
      const [preview, current] = await Promise.all([
        tx.agentPreview.findFirst({ where: { id: previewId, tripId: id, actorId: userId } }),
        tx.trip.findUnique({ where: { id }, include: { itineraryDays: true, items: true, pins: true, collaborators: { where: { userId }, select: { role: true } } } }),
      ]);
      if (!preview || !current) throw new Error("not_found");
      const role: CollaboratorRole = current.userId === userId ? "owner" : current.collaborators[0]?.role === "editor" ? "editor" : "viewer";
      if (!canCollaborator(role, "edit")) throw new Error("forbidden");
      if (preview.status !== "pending" || preview.expiresAt.getTime() <= Date.now()) throw new Error("preview_expired");
      if (current.revision !== baseRevision || preview.baseRevision !== baseRevision) throw new Error("version_conflict");
      const stored = preview.proposalJson as Record<string, unknown>;
      const proposal = agentProposalSchema.safeParse(stored?.proposal);
      const next = stored?.resultTrip as PersistedTripPayload | undefined;
      if (!proposal.success || !next || next.tripId !== id || next.revision !== baseRevision || !Array.isArray(next.itinerary) || !Array.isArray(next.pins)) throw new Error("invalid_agent_proposal");
      const updated = await tx.trip.updateMany({ where: { id, revision: baseRevision }, data: { revision: { increment: 1 } } });
      if (!updated.count) throw new Error("version_conflict");
      await applySnapshotPatch(tx, id, next);
      const beforeSnapshot = serializeTrip(current);
      const afterSnapshot = { ...next, revision: baseRevision + 1, updatedAt: new Date().toISOString() };
      const mutation = await tx.tripMutation.create({ data: {
        tripId: id, actorId: userId, baseRevision, resultRevision: baseRevision + 1,
        idempotencyKey, source: "agent", beforeSnapshot: JSON.parse(JSON.stringify(beforeSnapshot)),
        afterSnapshot: JSON.parse(JSON.stringify(afterSnapshot)), operationsJson: JSON.parse(JSON.stringify({ previewId, operations: proposal.data.operations })),
        inverseJson: JSON.parse(JSON.stringify({ restoreRevision: baseRevision })),
      } });
      await tx.agentPreview.update({ where: { id: previewId }, data: { status: "applied", appliedMutationId: mutation.id } });
      return { trip: afterSnapshot, revision: afterSnapshot.revision, mutationId: mutation.id };
    }, { timeout: 30_000 });
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    const errorCode = error && typeof error === "object" && "code" in error ? String(error.code) : null;
    const replayRace =
      (error instanceof Error && ["version_conflict", "preview_expired"].includes(error.message)) ||
      ["P2002", "P2034"].includes(errorCode || "");
    if (replayContext && replayRace) {
      const { tripId, idempotencyKey, userId, previewId } = replayContext;
      const committed = await prisma.tripMutation.findUnique({ where: { tripId_idempotencyKey: { tripId, idempotencyKey } } }).catch(() => null);
      if (committed) {
        const recorded = committed.operationsJson as { previewId?: unknown } | null;
        if (committed.actorId !== userId || committed.source !== "agent" || recorded?.previewId !== previewId) {
          return NextResponse.json(createError("idempotency_conflict", "這個請求識別碼已用於其他修改。"), { status: 409 });
        }
        const trip = committed.afterSnapshot as unknown as PersistedTripPayload | null;
        if (trip?.tripId === tripId && trip.revision === committed.resultRevision) {
          return NextResponse.json(createSuccess({ trip, revision: committed.resultRevision, mutationId: committed.id }));
        }
      }
    }
    if (error instanceof Error && error.message === "preview_expired") return NextResponse.json(createError("preview_expired", "預覽已過期，請重新產生。"), { status: 410 });
    if (error instanceof Error && error.message === "idempotency_conflict") return NextResponse.json(createError("idempotency_conflict", "這個請求識別碼已用於其他修改。"), { status: 409 });
    if (error instanceof Error && error.message === "invalid_agent_proposal") return NextResponse.json(createError("invalid_agent_proposal", "預覽資料無效，請重新產生。"), { status: 422 });
    return toApiError(error, "套用行程修改失敗。");
  }
}
