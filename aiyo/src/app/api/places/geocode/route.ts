import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { mapService } from "@/server/maps/service";
import { mapPoiToGeocodedPlace } from "@/server/maps/adapters";
import { assertGeocodeTripItemScope } from "@/server/places/validateGeocodeTripScope";
import { requireTripAccess } from "@/server/tripAccess";
import type { PlacesGeocodeRequest } from "@/types/geocode";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function failure(code: string, message: string, status: number) {
  return NextResponse.json({ success: false, error: { code, message } }, { status });
}

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as Partial<PlacesGeocodeRequest>;
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const purpose = body.purpose === "map_focus" ? "map_focus" : "itinerary_item";

    if (!query) {
      return failure("invalid_request", "請提供非空的地點查詢。", 400);
    }

    if (body.tripId) {
      try {
        await requireTripAccess(userId, body.tripId, "view");
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === "forbidden") {
            return failure("forbidden", "你沒有權限存取這趟行程。", 403);
          }
          if (error.message === "not_found") {
            return failure("not_found_trip", "找不到行程。", 404);
          }
        }
        throw error;
      }

      try {
        await assertGeocodeTripItemScope({
          tripId: body.tripId,
          dayId: body.dayId,
          itemId: body.itemId,
        });
      } catch {
        return failure("invalid_request", "行程天數或項目不屬於這趟行程。", 400);
      }
    }

    const candidates = await mapService.searchPlaces([query, body.destinationHint].filter(Boolean).join(" "), { limit: 1, language: "zh-TW" });
    const first = candidates[0];
    if (!first) return failure("not_found", "找不到符合的地點。", 404);
    const place = mapPoiToGeocodedPlace(first, query);

    if (purpose === "map_focus") {
      return NextResponse.json(
        createSuccess({ place }) satisfies { success: true; data: { place: typeof place } },
      );
    }

    return NextResponse.json(
      createSuccess({ place }) satisfies { success: true; data: { place: typeof place } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(createError("provider_error", "地理編碼失敗，請稍後再試。"), { status: 500 });
  }
}
