import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { listMemories } from "@/server/memory/mem0Client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const memories = await listMemories(userId);
    return NextResponse.json(createSuccess(memories));
  } catch (error) {
    return toApiError(error, "Failed to load memories.");
  }
}
