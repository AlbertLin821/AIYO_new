import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { serializeTrip } from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_EVENTS = 50;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "view");
    const rawRevision = new URL(request.url).searchParams.get("afterRevision");
    const afterRevision = rawRevision === null ? 0 : Number(rawRevision);
    if (!Number.isSafeInteger(afterRevision) || afterRevision < 0) {
      return NextResponse.json(createError("validation_error", "afterRevision 必須是非負整數。"), { status: 400 });
    }

    const trip = await prisma.trip.findUniqueOrThrow({
      where: { id },
      include: { itineraryDays: true, items: true, pins: true },
    });
    if (afterRevision > trip.revision) {
      return NextResponse.json(createError("version_conflict", "指定的版本比目前行程新。"), { status: 409 });
    }
    if (afterRevision === trip.revision) {
      return NextResponse.json(createSuccess({ currentRevision: trip.revision, events: [], gap: false, snapshot: null }));
    }

    const mutations = await prisma.tripMutation.findMany({
      where: { tripId: id, resultRevision: { gt: afterRevision, lte: trip.revision } },
      orderBy: { resultRevision: "asc" },
      take: MAX_EVENTS + 1,
      select: { id: true, baseRevision: true, resultRevision: true, source: true, createdAt: true },
    });
    const contiguous = mutations.length <= MAX_EVENTS &&
      mutations.length === trip.revision - afterRevision &&
      mutations.every((mutation, index) => mutation.baseRevision === afterRevision + index && mutation.resultRevision === afterRevision + index + 1);
    if (!contiguous) {
      return NextResponse.json(createSuccess({ currentRevision: trip.revision, events: [], gap: true, snapshot: serializeTrip(trip) }));
    }
    return NextResponse.json(createSuccess({
      currentRevision: trip.revision,
      events: mutations.map((mutation) => ({ ...mutation, createdAt: mutation.createdAt.toISOString() })),
      gap: false,
      snapshot: null,
    }));
  } catch (error) {
    return toApiError(error, "無法讀取行程修訂事件。");
  }
}
