import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
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
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to load trip."), { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as PersistedTripPayload;
    const trip = await saveTripPayload(userId, body);
    return NextResponse.json(createSuccess(trip));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to save trip."), { status: 500 });
  }
}
