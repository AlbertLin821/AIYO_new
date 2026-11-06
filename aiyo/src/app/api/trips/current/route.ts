import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { resolveSessionTrip, saveTripPayload } from "@/server/data/appStateService";
import type { PersistedTripPayload } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const trip = await resolveSessionTrip(userId);
    return NextResponse.json(createSuccess({ tripId: trip?.id ?? null }));
  } catch (error) {
    return toApiError(error, "Failed to load trip.");
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as PersistedTripPayload;
    if (body.tripId && !Number.isInteger(body.revision)) {
      return NextResponse.json(createError("version_conflict", "請重新載入行程後再儲存。"), { status: 409 });
    }
    const trip = await saveTripPayload(userId, body);
    return NextResponse.json(createSuccess(trip));
  } catch (error) {
    return toApiError(error, "Failed to save trip.");
  }
}
