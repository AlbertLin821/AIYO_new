import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { getCollaborationState, resolveSessionTrip } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const trip = await resolveSessionTrip(userId);
    const state = await getCollaborationState(trip.id);
    return NextResponse.json(createSuccess(state));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), { status: 401 });
    }
    return NextResponse.json(createError("internal_error", "Failed to load collaboration room."), { status: 500 });
  }
}
