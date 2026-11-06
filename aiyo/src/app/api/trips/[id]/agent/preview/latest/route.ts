import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { requireTripAccess } from "@/server/tripAccess";
import { buildPreviewUI } from "@/server/agent/previewUI";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "view");
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id }, select: { revision: true } });
    const preview = await prisma.agentPreview.findFirst({
      where: { tripId: id, actorId: userId, status: "pending", baseRevision: trip.revision, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
    });
    if (!preview) return NextResponse.json(createSuccess({ preview: null }));
    const stored = preview.proposalJson as Record<string, unknown>;
    const proposal = stored.proposal as { explanation?: string; operations?: unknown[] } | undefined;
    return NextResponse.json(createSuccess({ preview: {
      previewId: preview.id, expiresAt: preview.expiresAt.toISOString(), baseRevision: preview.baseRevision,
      summary: proposal?.explanation || "檢查行程修改", operations: proposal?.operations || [],
      changes: Array.isArray(stored.changes) ? stored.changes : [], warnings: Array.isArray(stored.warnings) ? stored.warnings : [],
      ui: buildPreviewUI(Array.isArray(stored.changes) ? stored.changes as Parameters<typeof buildPreviewUI>[0] : [], Array.isArray(proposal?.operations) ? proposal.operations as Parameters<typeof buildPreviewUI>[1] : []),
    } }));
  } catch (error) { return toApiError(error, "無法載入待確認預覽。"); }
}
