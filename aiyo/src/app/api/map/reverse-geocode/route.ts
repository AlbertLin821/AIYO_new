import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { mapService } from "@/server/maps/service";
import { parsePoint } from "@/server/maps/validation";
import type { GeocodeApiResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSessionUser();
    const body = (await request.json()) as { lat?: number; lng?: number };
    const point = parsePoint(body.lat, body.lng);
    const poi = await mapService.reverseGeocode(point, "zh");
    if (!poi) return NextResponse.json(createError("reverse_geocode_failed", "找不到對應地址。"), { status: 422 });
    const result: GeocodeApiResult = { query: `${point.lat},${point.lng}`, name: poi.name, formattedAddress: poi.address || poi.name, lat: poi.location.lat, lng: poi.location.lng, placeId: poi.externalId || poi.id, types: [] };
    return NextResponse.json(createSuccess({ result }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    return NextResponse.json(createError("internal_error", "反向地理編碼失敗，請稍後再試。"), { status: 500 });
  }
}
