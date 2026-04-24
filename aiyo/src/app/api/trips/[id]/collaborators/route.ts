import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { requireTripAccess } from "@/server/tripAccess";
import type { CollaboratorRole } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizeRole(role: unknown): CollaboratorRole | null {
  return role === "editor" || role === "viewer" || role === "owner" ? role : null;
}

function serializeCollaborator(input: {
  id: string;
  tripId: string;
  userId: string;
  role: string;
  user: { name: string | null; email: string; image: string | null };
}) {
  return {
    id: input.id,
    tripId: input.tripId,
    userId: input.userId,
    role: input.role,
    user: {
      name: input.user.name,
      email: input.user.email,
      image: input.user.image,
    },
  };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "view");
    const trip = await prisma.trip.findUniqueOrThrow({
      where: { id },
      include: {
        user: true,
        collaborators: { include: { user: true }, orderBy: { createdAt: "asc" } },
      },
    });
    return NextResponse.json(
      createSuccess([
        {
          id: `owner_${trip.id}`,
          tripId: trip.id,
          userId: trip.userId,
          role: "owner",
          user: {
            name: trip.user.name,
            email: trip.user.email,
            image: trip.user.image,
          },
        },
        ...trip.collaborators.map(serializeCollaborator),
      ]),
    );
  } catch (error) {
    return toApiError(error, "Failed to load collaborators.");
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "invite");
    const body = (await request.json()) as {
      email?: string;
      userId?: string;
      role?: CollaboratorRole;
    };
    const role = normalizeRole(body.role || "viewer");
    if (!role || role === "owner") {
      return NextResponse.json(createError("invalid_request", "Role must be editor or viewer."), {
        status: 400,
      });
    }
    const user = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : body.email
        ? await prisma.user.findUnique({ where: { email: body.email.trim().toLowerCase() } })
        : null;
    if (!user) {
      return NextResponse.json(createError("not_found", "User was not found."), { status: 404 });
    }
    const trip = await prisma.trip.findUniqueOrThrow({ where: { id } });
    if (trip.userId === user.id) {
      return NextResponse.json(createError("invalid_request", "Owner is already a collaborator."), {
        status: 400,
      });
    }
    const collaborator = await prisma.tripCollaborator.upsert({
      where: {
        tripId_userId: {
          tripId: id,
          userId: user.id,
        },
      },
      create: {
        tripId: id,
        userId: user.id,
        role,
      },
      update: { role },
      include: { user: true },
    });
    return NextResponse.json(createSuccess(serializeCollaborator(collaborator)), { status: 201 });
  } catch (error) {
    return toApiError(error, "Failed to add collaborator.");
  }
}

