import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { deleteMemory, getMemory, updateMemory } from "@/server/memory/mem0Client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ensureOwnership(userId: string, memoryUserId?: string) {
  if (!memoryUserId || memoryUserId !== userId) {
    throw new Error("not_found");
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    const body = (await request.json()) as { text?: string };

    if (!body.text?.trim()) {
      return NextResponse.json(createError("invalid_request", "記憶內容不能為空。"), {
        status: 400,
      });
    }

    const current = await getMemory(id);
    ensureOwnership(userId, current?.user_id);

    const updated = await updateMemory({
      memoryId: id,
      text: body.text.trim(),
      metadata: current?.metadata || null,
    });
    return NextResponse.json(createSuccess(updated));
  } catch (error) {
    return toApiError(error, "Failed to update memory.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    const current = await getMemory(id);
    ensureOwnership(userId, current?.user_id);
    await deleteMemory(id);
    return NextResponse.json(createSuccess({ id }));
  } catch (error) {
    return toApiError(error, "Failed to delete memory.");
  }
}
