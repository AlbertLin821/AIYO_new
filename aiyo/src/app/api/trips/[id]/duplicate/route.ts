import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { duplicateTripForUser } from "@/server/data/appStateService";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    const result = await duplicateTripForUser(userId, id);
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    return toApiError(error, "Failed to duplicate trip.");
  }
}
