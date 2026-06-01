import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { listPublicItineraries } from "@/server/services/publicItineraryService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSessionUser();
    const url = new URL(request.url);
    const q = url.searchParams.get("q") || undefined;
    const cursor = url.searchParams.get("cursor") || undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : undefined;

    const result = await listPublicItineraries({ q, cursor, limit });
    return NextResponse.json(createSuccess(result));
  } catch (error) {
    return toApiError(error, "Failed to list public itineraries.");
  }
}
