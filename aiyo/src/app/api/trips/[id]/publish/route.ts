import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import {
  getTripPublicationStatus,
  publishTripForUser,
  unpublishTripForUser,
} from "@/server/services/publicItineraryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireSessionUser();
    const { id } = await context.params;
    const status = await getTripPublicationStatus(id);
    return NextResponse.json(createSuccess(status));
  } catch (error) {
    return toApiError(error, "Failed to load publication status.");
  }
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    const result = await publishTripForUser(userId, id);
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    return toApiError(error, "Failed to publish trip.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await unpublishTripForUser(userId, id);
    return NextResponse.json(createSuccess({ ok: true }));
  } catch (error) {
    return toApiError(error, "Failed to unpublish trip.");
  }
}
