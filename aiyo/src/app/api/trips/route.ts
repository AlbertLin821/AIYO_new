import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { listTripsForLibrary } from "@/server/data/appStateService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const { searchParams } = new URL(request.url);
    const scopeRaw = searchParams.get("scope");
    const scope = scopeRaw === "mine" ? "mine" : "recent";
    const trips = await listTripsForLibrary(userId, scope);
    return NextResponse.json(createSuccess(trips));
  } catch (error) {
    return toApiError(error, "Failed to list trips.");
  }
}
