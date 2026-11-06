import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { canCollaborator, type CollaboratorRole } from "@/lib/permissions";
import { prisma } from "@/lib/prisma";
import { planAgentPreview, type VerifiedAgentPlace } from "@/server/agent/previewPlanner";
import { validatePreviewTravel } from "@/server/agent/previewTravelValidation";
import { buildPreviewUI } from "@/server/agent/previewUI";
import { resolveAgentPlaceCandidate } from "@/server/agent/readTools";
import { agentProposalSchema, previewPlaceAdjustmentSchema } from "@/server/agent/schemas";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { serializeTrip } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; previewId: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id, previewId } = await context.params;
    await requireTripAccess(userId, id, "edit");
    const input = previewPlaceAdjustmentSchema.safeParse(await request.json());
    if (!input.success) return NextResponse.json(createError("validation_error", "請輸入具體的景點或店家名稱。"), { status: 400 });
    const trip = await prisma.trip.findUnique({ where: { id }, select: { destination: true, revision: true } });
    if (!trip) return NextResponse.json(createError("not_found", "找不到行程。"), { status: 404 });
    if (!trip.destination) return NextResponse.json(createError("validation_error", "請先設定行程目的地。"), { status: 422 });
    const pending = await prisma.agentPreview.findFirst({ where: { id: previewId, tripId: id, actorId: userId, status: "pending", baseRevision: trip.revision, expiresAt: { gt: new Date() } } });
    if (!pending) return NextResponse.json(createError("preview_expired", "預覽已失效，請重新產生。"), { status: 409 });
    const pendingProposal = agentProposalSchema.safeParse((pending.proposalJson as Record<string, unknown>).proposal);
    const pendingOperation = pendingProposal.success ? pendingProposal.data.operations[input.data.operationIndex] : null;
    if (!pendingOperation || (pendingOperation.type !== "add_item" && pendingOperation.type !== "replace_item")) {
      return NextResponse.json(createError("invalid_agent_proposal", "這項修改無法更換地點。"), { status: 422 });
    }
    const replacement = await resolveAgentPlaceCandidate(input.data.query, trip.destination);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${previewId}))::text`;
      const [preview, current] = await Promise.all([
        tx.agentPreview.findFirst({ where: { id: previewId, tripId: id, actorId: userId } }),
        tx.trip.findUnique({ where: { id }, include: { itineraryDays: true, items: true, pins: true, collaborators: { where: { userId }, select: { role: true } } } }),
      ]);
      if (!preview || !current) throw new Error("not_found");
      const role: CollaboratorRole = current.userId === userId ? "owner" : current.collaborators[0]?.role === "editor" ? "editor" : "viewer";
      if (!canCollaborator(role, "edit")) throw new Error("forbidden");
      if (preview.status !== "pending" || preview.expiresAt <= new Date()) throw new Error("preview_expired");
      if (preview.baseRevision !== current.revision || trip.revision !== current.revision || trip.destination !== current.destination) throw new Error("version_conflict");
      const stored = preview.proposalJson as Record<string, unknown>;
      const proposal = agentProposalSchema.safeParse(stored.proposal);
      if (!proposal.success || !Array.isArray(stored.places)) throw new Error("invalid_agent_proposal");
      const operation = proposal.data.operations[input.data.operationIndex];
      if (!operation || (operation.type !== "add_item" && operation.type !== "replace_item")) throw new Error("invalid_operation");
      const operations = proposal.data.operations.map((candidate, index) => index === input.data.operationIndex
        ? { ...candidate, placeId: replacement.id }
        : candidate);
      const explanation = operations.length === 1
        ? operation.type === "add_item" ? `加入${replacement.title}` : `替換為${replacement.title}`
        : `已將第 ${input.data.operationIndex + 1} 項改為${replacement.title}`;
      const adjusted = agentProposalSchema.parse({ ...proposal.data, operations, explanation });
      const neededIds = new Set(adjusted.operations.flatMap((candidate) => candidate.type === "add_item" || candidate.type === "replace_item" ? [candidate.placeId] : []));
      const places = new Map((stored.places as VerifiedAgentPlace[]).filter((place) => neededIds.has(place.id)).map((place) => [place.id, place]));
      places.set(replacement.id, replacement);
      const currentTrip = serializeTrip(current);
      const calculated = await validatePreviewTravel(currentTrip, planAgentPreview(currentTrip, adjusted, places));
      const updatedStored = { proposal: adjusted, places: [...places.values()], resultTrip: calculated.trip, changes: calculated.changes, warnings: calculated.warnings };
      await tx.agentPreview.update({ where: { id: previewId }, data: { proposalJson: JSON.parse(JSON.stringify(updatedStored)) } });
      return {
        previewId, expiresAt: preview.expiresAt.toISOString(), baseRevision: preview.baseRevision,
        summary: adjusted.explanation, operations: adjusted.operations, changes: calculated.changes,
        warnings: calculated.warnings, ui: buildPreviewUI(calculated.changes, adjusted.operations),
      };
    }, { timeout: 30_000 });
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    if (error instanceof Error && ["preview_expired", "version_conflict"].includes(error.message)) {
      return NextResponse.json(createError(error.message, "行程或預覽已變更，請重新產生預覽。"), { status: 409 });
    }
    if (error instanceof Error && ["schedule_conflict", "travel_time_conflict", "opening_hours_conflict"].includes(error.message)) {
      return NextResponse.json(createError(error.message, "時間與行程順序、路程或可確認的營業時段衝突，請先調整時間。"), { status: 422 });
    }
    if (error instanceof Error && ["invalid_agent_proposal", "invalid_operation", "unverified_place"].includes(error.message)) {
      return NextResponse.json(createError("invalid_agent_proposal", "找不到符合目的地且可驗證的地點，請換個名稱。"), { status: 422 });
    }
    return toApiError(error, "替換預覽地點失敗。");
  }
}
