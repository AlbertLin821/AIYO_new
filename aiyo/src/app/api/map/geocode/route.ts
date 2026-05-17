import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { serverConfig } from "@/server/config";
import { fetchGooglePlaceDetailsByPlaceId, geocodeWithGoogle } from "@/server/geo/geocodeService";
import type { GeocodeApiResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    if (!serverConfig.googleMapsApiKey) {
      return NextResponse.json(
        createError(
          "maps_key_missing",
          "未設定 GOOGLE_MAPS_API_KEY，無法使用地理編碼。",
        ),
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      locations?: string[];
      queries?: string[];
      region?: string;
    };

    const rawList = Array.isArray(body.queries)
      ? body.queries
      : Array.isArray(body.locations)
        ? body.locations
        : [];

    const queries = rawList.map((q) => String(q).trim()).filter(Boolean);

    if (queries.length === 0) {
      return NextResponse.json(
        createError("invalid_request", "請提供非空的 queries 或 locations 陣列。"),
        { status: 400 },
      );
    }

    const region = body.region?.trim();
    const results: GeocodeApiResult[] = [];
    const errors: string[] = [];

    for (const query of queries) {
      const resolved = await geocodeWithGoogle(query, region);
      if (!resolved.ok) {
        console.warn(`[geocode] Failed for "${query}": ${resolved.reason}`);
        errors.push(`${query}: ${resolved.reason}`);
        continue;
      }
      const details = await fetchGooglePlaceDetailsByPlaceId(resolved.result.placeId);
      results.push({
        ...resolved.result,
        photoUrl: details.photoUrl,
        thumbnail: details.thumbnail || details.photoUrl,
        openingHours: details.openingHours,
        phoneNumber: details.phoneNumber,
        website: details.website,
        googleMapsUrl: details.googleMapsUrl,
        rating: details.rating,
        userRatingsTotal: details.userRatingsTotal,
      });
    }

    if (results.length === 0) {
      return NextResponse.json(
        createError(
          "geocode_failed",
          "Google 地理編碼未回傳任何符合的地點。",
          errors.length ? errors : undefined,
        ),
        { status: 422 },
      );
    }

    return NextResponse.json(
      createSuccess({ results }, errors.length ? { partialFailures: errors } : undefined),
    );
  } catch {
    return NextResponse.json(
      createError("internal_error", "地理編碼失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}
