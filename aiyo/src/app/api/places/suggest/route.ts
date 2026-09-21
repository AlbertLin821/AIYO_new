import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { mapService } from "@/server/maps/service";
import { mapPoiToSuggestion } from "@/server/maps/adapters";
import type { PlacesSuggestRequest } from "@/types/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const body = (await request.json()) as Partial<PlacesSuggestRequest>;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const maxResults =
      typeof body.maxResults === "number" && Number.isFinite(body.maxResults)
        ? Math.floor(body.maxResults)
        : undefined;

    if (!query) {
      return failure("invalid_request", "請提供非空的地點查詢。", 400);
    }

    const suggestions = (await mapService.searchPlaces(query, { limit: maxResults, language: "zh-TW" })).map((poi) => mapPoiToSuggestion(poi, query));

    return NextResponse.json(
      createSuccess({
        suggestions,
        autoResolve: suggestions.length === 1 ? suggestions[0] : null,
      }),
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("provider_error", "地點建議查詢失敗，請稍後再試。"), { status: 500 });
  }
}
