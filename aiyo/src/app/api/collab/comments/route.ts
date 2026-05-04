import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { addComment, deleteComment } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as { roomId?: string; content?: string };
    if (!body.roomId || !body.content?.trim()) {
      return NextResponse.json(createError("invalid_request", "roomId and content are required."), { status: 400 });
    }
    const state = await addComment(body.roomId, userId, body.content.trim());
    return NextResponse.json(createSuccess(state));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to save comment."), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId")?.trim();
    const commentId = searchParams.get("commentId")?.trim();
    if (!roomId || !commentId) {
      return NextResponse.json(createError("invalid_request", "roomId and commentId are required."), { status: 400 });
    }
    const state = await deleteComment(roomId, commentId, userId);
    return NextResponse.json(createSuccess(state));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    if (error instanceof Error && error.message === "forbidden") {
      return NextResponse.json(createError("forbidden", "You cannot delete this comment."), { status: 403 });
    }
    if (error instanceof Error && error.message === "not_found") {
      return NextResponse.json(createError("not_found", "Comment not found."), { status: 404 });
    }
    return NextResponse.json(createError("internal_error", "Failed to delete comment."), { status: 500 });
  }
}
