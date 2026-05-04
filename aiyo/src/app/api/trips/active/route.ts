import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { setUserActiveTripId } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const json = (await request.json()) as { tripId?: unknown };
    const tripId = typeof json.tripId === "string" ? json.tripId.trim() : "";
    if (!tripId) {
      return NextResponse.json(createError("invalid_body", "tripId is required."), { status: 400 });
    }
    await requireTripAccess(userId, tripId, "view");
    await setUserActiveTripId(userId, tripId);
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    return toApiError(error, "Failed to set active trip.");
  }
}
