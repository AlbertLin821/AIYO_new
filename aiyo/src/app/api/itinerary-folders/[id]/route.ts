import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { findDuplicateFolderForUser } from "@/server/itineraryFolderNames";
import { assertFolderOwner } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function serializeFolder(folder: {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: folder.id,
    name: folder.name,
    sortOrder: folder.sortOrder,
    createdAt: folder.createdAt.toISOString(),
    updatedAt: folder.updatedAt.toISOString(),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await assertFolderOwner(userId, id);

    const body = (await request.json()) as { name?: string; sortOrder?: number };
    const data: { name?: string; sortOrder?: number } = {};
    if (body.name !== undefined) {
      const name = body.name.trim();
      if (!name) {
        return NextResponse.json(createError("invalid_request", "Folder name cannot be empty."), {
          status: 400,
        });
      }
      if (await findDuplicateFolderForUser(userId, name, id)) {
        return NextResponse.json(createError("invalid_request", "Folder name already exists."), {
          status: 409,
        });
      }
      data.name = name;
    }
    if (body.sortOrder !== undefined) {
      data.sortOrder = Number(body.sortOrder) || 0;
    }

    const folder = await prisma.itineraryFolder.update({
      where: { id },
      data,
    });
    return NextResponse.json(createSuccess(serializeFolder(folder)));
  } catch (error) {
    return toApiError(error, "Failed to update itinerary folder.");
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await assertFolderOwner(userId, id);
    await prisma.$transaction([
      prisma.trip.updateMany({
        where: { folderId: id, userId },
        data: { folderId: null },
      }),
      prisma.itineraryFolder.delete({ where: { id } }),
    ]);
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    return toApiError(error, "Failed to delete itinerary folder.");
  }
}

