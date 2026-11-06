import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { proposeAgentOperations } from "@/server/agent/modelAdapter";
import { buildPreviewUI } from "@/server/agent/previewUI";
import { createAgentToolRegistry } from "@/server/agent/toolRegistry";
import { previewRequestSchema } from "@/server/agent/schemas";
import { isAgentPreviewEnabled } from "@/server/agent/rollout";
import { observeAgentApi } from "@/server/agent/apiTelemetry";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return observeAgentApi("preview", () => createPreview(request, context));
}

async function createPreview(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    const tools = createAgentToolRegistry(userId, id);
    const trip = await tools.readTrip();
    if (!isAgentPreviewEnabled(userId)) {
      return NextResponse.json(createError("feature_unavailable", "行程修改預覽目前暫停使用，請稍後再試。"), { status: 503 });
    }
    const parsed = previewRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(createError("validation_error", "預覽輸入格式不正確。"), { status: 400 });
    if (trip.revision !== parsed.data.baseRevision) return NextResponse.json(createError("version_conflict", "行程已有新修改，請重新預覽。"), { status: 409 });
    const ids = new Set(trip.itinerary.flatMap((day) => day.items.map((item) => item.id)));
    if (parsed.data.selectedEntityIds?.some((selectedId) => !ids.has(selectedId))) {
      return NextResponse.json(createError("validation_error", "選中的行程項目不屬於此行程。"), { status: 422 });
    }
    const rawProposal = await proposeAgentOperations(parsed.data.instruction, trip, parsed.data.selectedEntityIds || []);
    const { proposal, places } = await tools.searchVerifiedPlaces(rawProposal, parsed.data.instruction);
    const result = await tools.validateSchedule(proposal);
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    const preview = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))::text`;
      const current = await tx.trip.findUniqueOrThrow({ where: { id }, select: { revision: true } });
      if (current.revision !== trip.revision) throw new Error("version_conflict");
      await tx.agentPreview.updateMany({ where: { tripId: id, actorId: userId, status: "pending" }, data: { status: "cancelled" } });
      return tx.agentPreview.create({ data: {
        tripId: id, actorId: userId, baseRevision: trip.revision || 0, expiresAt,
        proposalJson: JSON.parse(JSON.stringify({ proposal, places, resultTrip: result.trip, changes: result.changes, warnings: result.warnings })),
      } });
    });
    void prisma.agentPreview.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } }).catch(() => {});
    return NextResponse.json(createSuccess({
      previewId: preview.id, expiresAt: expiresAt.toISOString(), baseRevision: preview.baseRevision,
      summary: proposal.explanation, operations: proposal.operations, changes: result.changes, warnings: result.warnings,
      ui: buildPreviewUI(result.changes, proposal.operations),
    }));
  } catch (error) {
    if (error instanceof Error && ["agent_tool_timeout", "agent_tool_limit", "invalid_agent_tool_output"].includes(error.message)) {
      return NextResponse.json(createError("agent_tool_unavailable", "地點或行程驗證暫時無法完成，請稍後重試。"), { status: 503 });
    }
    if (error instanceof Error && ["invalid_agent_proposal", "unverified_place", "too_many_place_queries", "item_not_found", "day_not_found", "after_item_not_found", "after_item_self", "schedule_conflict", "travel_time_conflict", "opening_hours_conflict"].includes(error.message)) {
      console.warn("[agent-preview] rejected", { reason: error.message });
      return NextResponse.json(createError("invalid_agent_proposal", "目前無法產生可驗證的修改預覽，請指明行程項目或地點。"), { status: 422 });
    }
    return toApiError(error, "產生行程修改預覽失敗。");
  }
}
