import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { saveTripPayload } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";
import type { PersistedTripPayload } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "edit");
    const body = (await request.json()) as PersistedTripPayload;
    const trip = await saveTripPayload(userId, {
      ...body,
      tripId: id,
    });
    return NextResponse.json(createSuccess(trip));
  } catch (error) {
    return toApiError(error, "Failed to save trip.");
  }
}

