import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { getPublicItineraryDetail } from "@/server/services/publicItineraryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ publicationId: string }> },
) {
  try {
    await requireSessionUser();
    const { publicationId } = await context.params;
    const detail = await getPublicItineraryDetail(publicationId);
    return NextResponse.json(createSuccess(detail));
  } catch (error) {
    return toApiError(error, "Failed to load public itinerary.");
  }
}
