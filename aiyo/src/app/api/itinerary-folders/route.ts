import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { findDuplicateFolderForUser } from "@/server/itineraryFolderNames";

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

export async function GET() {
  try {
    const { userId } = await requireSessionUser();
    const folders = await prisma.itineraryFolder.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(createSuccess(folders.map(serializeFolder)));
  } catch (error) {
    return toApiError(error, "Failed to load itinerary folders.");
  }
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as { name?: string; sortOrder?: number };
    const name = body.name?.trim();
    if (!name) {
      return NextResponse.json(createError("invalid_request", "Folder name is required."), {
        status: 400,
      });
    }
    if (await findDuplicateFolderForUser(userId, name)) {
      return NextResponse.json(createError("invalid_request", "Folder name already exists."), {
        status: 409,
      });
    }
    const folder = await prisma.itineraryFolder.create({
      data: {
        userId,
        name,
        sortOrder: Number.isFinite(body.sortOrder) ? Number(body.sortOrder) : 0,
      },
    });
    return NextResponse.json(createSuccess(serializeFolder(folder)), { status: 201 });
  } catch (error) {
    return toApiError(error, "Failed to create itinerary folder.");
  }
}

