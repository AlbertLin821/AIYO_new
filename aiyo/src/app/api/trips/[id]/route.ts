import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { parseTripStartDate } from "@/lib/tripDate";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import {
  clearActiveTripIfMatches,
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
    const body = (await request.json()) as { title?: unknown; coverImageUrl?: unknown; startDate?: unknown; revision?: unknown };
    if (!Number.isInteger(body.revision) || (body.revision as number) < 0) {
      return NextResponse.json(createError("version_conflict", "請重新載入行程後再儲存。"), { status: 409 });
    }
    const hasTitle = Object.prototype.hasOwnProperty.call(body, "title");
    const hasCover = Object.prototype.hasOwnProperty.call(body, "coverImageUrl");
    const hasStartDate = Object.prototype.hasOwnProperty.call(body, "startDate");
    if (!hasTitle && !hasCover && !hasStartDate) {
      return NextResponse.json(createError("validation_error", "請提供要更新的行程資料。"), {
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
    if (hasStartDate && body.startDate !== null && typeof body.startDate !== "string") {
      return NextResponse.json(createError("validation_error", "出發日期格式不正確。"), { status: 400 });
    }
    let startDate: Date | null = null;
    if (hasStartDate) {
      try { startDate = parseTripStartDate(body.startDate as string | null); }
      catch { return NextResponse.json(createError("validation_error", "請輸入有效的出發日期。"), { status: 400 }); }
    }
    const existing = await prisma.trip.findUnique({
      where: { id },
      select: { id: true, destination: true },
    });
    if (!existing) {
      return NextResponse.json(createError("not_found", "找不到行程。"), { status: 404 });
    }
    const data: { title?: string; coverImageUrl?: string | null; startDate?: Date | null } = {};
    if (hasTitle) {
      data.title = normalizeTripStorageTitle(body.title as string, existing.destination);
    }
    if (hasCover) {
      const raw = body.coverImageUrl as string | null;
      data.coverImageUrl =
        raw !== null && String(raw).trim().length > 0 ? String(raw).trim() : null;
    }
    if (hasStartDate) data.startDate = startDate;
    const updated = await prisma.$transaction(async (tx) => {
      const saved = await tx.trip.updateMany({
        where: { id, revision: body.revision as number },
        data: { ...data, revision: { increment: 1 } },
      });
      if (!saved.count) throw new Error("version_conflict");
      return tx.trip.findUniqueOrThrow({
        where: { id },
        select: { id: true, title: true, coverImageUrl: true, startDate: true, revision: true },
      });
    });
    return NextResponse.json(
      createSuccess({
        id: updated.id,
        title: updated.title,
        coverImageUrl: updated.coverImageUrl ?? null,
        startDate: updated.startDate?.toISOString().slice(0, 10) ?? null,
        revision: updated.revision,
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
    if (!Number.isInteger(body.revision)) {
      return NextResponse.json(createError("version_conflict", "請重新載入行程後再儲存。"), { status: 409 });
    }
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
    await prisma.trip.delete({ where: { id } });
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    return toApiError(error, "Failed to delete trip.");
  }
}

