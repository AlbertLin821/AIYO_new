import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import {
  clearActiveTripIfMatches,
  ensureAtLeastOneOwnedTripAfterDelete,
  normalizeTripStorageTitle,
  saveTripPayload,
} from "@/server/data/appStateService";
import { requireTripAccess } from "@/server/tripAccess";
import type { PersistedTripPayload } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "edit");
    const body = (await request.json()) as { title?: unknown; coverImageUrl?: unknown };
    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasCover = Object.prototype.hasOwnProperty.call(body, "coverImageUrl");
    if (!hasTitle && !hasCover) {
      return NextResponse.json(createError("validation_error", "請提供標題或封面更新。"), {
        status: 400,
      });
    }
    if (hasTitle && typeof body.title !== "string") {
      return NextResponse.json(createError("validation_error", "標題格式不正確。"), {
        status: 400,
      });
    }
    if (
      hasCover &&
      body.coverImageUrl !== null &&
      typeof body.coverImageUrl !== "string"
    ) {
      return NextResponse.json(createError("validation_error", "封面圖片格式不正確。"), {
        status: 400,
      });
    }
    const existing = await prisma.trip.findUnique({
      where: { id },
      select: { id: true, destination: true },
    });
    if (!existing) {
      return NextResponse.json(createError("not_found", "找不到行程。"), { status: 404 });
    }
    const data: { title?: string; coverImageUrl?: string | null } = {};
    if (hasTitle) {
      data.title = normalizeTripStorageTitle(body.title as string, existing.destination);
    }
    if (hasCover) {
      const raw = body.coverImageUrl as string | null;
      data.coverImageUrl =
        raw !== null && String(raw).trim().length > 0 ? String(raw).trim() : null;
    }
    const updated = await prisma.trip.update({
      where: { id },
      data,
      select: { id: true, title: true, coverImageUrl: true },
    });
    return NextResponse.json(
      createSuccess({
        id: updated.id,
        title: updated.title,
        coverImageUrl: updated.coverImageUrl ?? null,
      }),
    );
  } catch (error) {
    return toApiError(error, "Failed to update trip.");
  }
}

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

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    const row = await prisma.trip.findUnique({
      where: { id },
      select: { userId: true },
    });
    if (!row) {
      return NextResponse.json(createError("not_found", "找不到行程。"), { status: 404 });
    }
    await requireTripAccess(userId, id, "delete");
    await clearActiveTripIfMatches(userId, id);
    const ownerId = row.userId;
    await prisma.trip.delete({ where: { id } });
    await ensureAtLeastOneOwnedTripAfterDelete(ownerId);
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    return toApiError(error, "Failed to delete trip.");
  }
}

