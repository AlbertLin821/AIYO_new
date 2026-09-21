import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { mapService } from "@/server/maps/service";
import type { GeocodeApiResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const body = (await request.json()) as { locations?: string[]; queries?: string[]; region?: string };
    const raw = Array.isArray(body.queries) ? body.queries : Array.isArray(body.locations) ? body.locations : [];
    const queries = raw.map(String).map((value) => value.trim()).filter(Boolean).slice(0, 12);
    if (!queries.length) return NextResponse.json(createError("invalid_request", "請提供非空的 queries 或 locations 陣列。"), { status: 400 });
    const settled = await Promise.allSettled(queries.map((query) => mapService.searchPlaces([query, body.region].filter(Boolean).join(" "), { limit: 1, language: "zh" })));
    const results: GeocodeApiResult[] = [];
    settled.forEach((entry, index) => { if (entry.status === "fulfilled" && entry.value[0]) { const poi = entry.value[0]; results.push({ query: queries[index]!, name: poi.name, formattedAddress: poi.address || poi.name, lat: poi.location.lat, lng: poi.location.lng, placeId: poi.externalId || poi.id, types: [] }); } });
    if (!results.length) return NextResponse.json(createError("geocode_failed", "地理編碼未回傳任何符合的地點。"), { status: 422 });
    return NextResponse.json(createSuccess({ results }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    return NextResponse.json(createError("internal_error", "地理編碼失敗，請稍後再試。"), { status: 500 });
  }
}
