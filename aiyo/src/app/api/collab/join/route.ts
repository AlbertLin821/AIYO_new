import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { requireSessionUser } from "@/server/auth";
import { upsertPresence } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as { inviteCode?: string };
    const inviteCode = body.inviteCode?.trim();

    if (!inviteCode || inviteCode.length < 4) {
      return NextResponse.json(
        createError("invalid_request", "Invite code must be at least 4 characters."),
        { status: 400 },
      );
    }

    const room = await prisma.collaborationRoom.findUnique({
      where: { inviteCode },
      include: {
        trip: true,
        presences: true,
      },
    });

    if (!room) {
      return NextResponse.json(
        createError("not_found", "Invite code was not found."),
        { status: 404 },
      );
    }

    await upsertPresence({
      roomId: room.id,
      userId,
      activeSection: "collaboration",
      selectedEntityId: room.tripId,
    });

    return NextResponse.json(
      createSuccess({
        tripId: room.tripId,
        tripName: room.trip.title,
        role: room.trip.userId === userId ? "owner" : "editor",
        members: room.presences.length,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(
        createError("unauthorized", "Authentication required."),
        { status: 401 },
      );
    }
    return NextResponse.json(
      createError("internal_error", "Failed to join collaboration session."),
      { status: 500 },
    );
  }
}
