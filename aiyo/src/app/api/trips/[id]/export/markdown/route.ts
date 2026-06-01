import { NextResponse } from "next/server";
import { createError } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { getTripSwitchPayload } from "@/server/data/appStateService";
import { buildTripMarkdown } from "@/server/export/tripMarkdown";
import { requireTripAccess } from "@/server/tripAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { userId } = await requireSessionUser();
    const { id } = await context.params;
    await requireTripAccess(userId, id, "view");
    const { trip } = await getTripSwitchPayload(userId, id);
    const markdown = buildTripMarkdown(trip);
    const safeName = (trip.title || "trip")
      .replace(/[^\w\u4e00-\u9fff\-]+/g, "_")
      .slice(0, 80);
    return new NextResponse(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${safeName}-${id.slice(0, 8)}.md"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "not_found") {
      return NextResponse.json(createError("not_found", "找不到行程。"), { status: 404 });
    }
    return toApiError(error, "Failed to export trip.");
  }
}
