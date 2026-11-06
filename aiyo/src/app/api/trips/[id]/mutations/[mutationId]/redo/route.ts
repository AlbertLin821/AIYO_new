import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { redoAgentMutation } from "@/server/agent/mutationHistory";
import { mutationRequestSchema } from "@/server/agent/schemas";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string; mutationId: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id, mutationId } = await context.params;
    await requireTripAccess(userId, id, "edit");
    const parsed = mutationRequestSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json(createError("validation_error", "重做請求格式不正確。"), { status: 400 });
    const result = await redoAgentMutation(userId, id, mutationId, parsed.data.baseRevision, parsed.data.idempotencyKey);
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    return toApiError(error, "重做行程修改失敗。");
  }
}
