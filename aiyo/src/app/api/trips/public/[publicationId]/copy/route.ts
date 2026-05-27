import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { copyPublicItineraryForUser } from "@/server/services/publicItineraryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { publicationId } = await context.params;
    const result = await copyPublicItineraryForUser(userId, publicationId);
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    return toApiError(error, "Failed to copy public itinerary.");
  }
}
