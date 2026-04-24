import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { requireTripAccess } from "@/server/tripAccess";
import type { CollaboratorRole } from "@/lib/permissions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

function normalizeRole(role: unknown): CollaboratorRole | null {
  return role === "editor" || role === "viewer" ? role : null;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { userId: actorId } = await requireSessionUser();
    const { id, userId } = await context.params;
    await requireTripAccess(actorId, id, "managePermissions");
    const body = (await request.json()) as { role?: CollaboratorRole };
    const role = normalizeRole(body.role);
    if (!role) {
      return NextResponse.json(createError("invalid_request", "Role must be editor or viewer."), {
        status: 400,
      });
    }
    const collaborator = await prisma.tripCollaborator.update({
      where: {
        tripId_userId: {
          tripId: id,
          userId,
        },
      },
      data: { role },
      include: { user: true },
    });
    return NextResponse.json(createSuccess(serializeCollaborator(collaborator)));
  } catch (error) {
    return toApiError(error, "Failed to update collaborator.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  try {
    const { userId: actorId } = await requireSessionUser();
    const { id, userId } = await context.params;
    await requireTripAccess(actorId, id, "delete");
    await prisma.tripCollaborator.delete({
      where: {
        tripId_userId: {
          tripId: id,
          userId,
        },
      },
    });
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    return toApiError(error, "Failed to remove collaborator.");
  }
}

