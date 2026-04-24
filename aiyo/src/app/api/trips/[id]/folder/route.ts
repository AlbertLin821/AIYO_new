import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { assertFolderOwner, requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "managePermissions");
    const body = (await request.json()) as { folderId?: string | null };
    if (body.folderId) {
      await assertFolderOwner(userId, body.folderId);
    }
    const trip = await prisma.trip.update({
      where: { id },
      data: {
        folderId: body.folderId || null,
      },
      select: {
        id: true,
        folderId: true,
        updatedAt: true,
      },
    });
    return NextResponse.json(
      createSuccess({
        id: trip.id,
        folderId: trip.folderId,
        updatedAt: trip.updatedAt.toISOString(),
      }),
    );
  } catch (error) {
    return toApiError(error, "Failed to move trip to folder.");
  }
}

