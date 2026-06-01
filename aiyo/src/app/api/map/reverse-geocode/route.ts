import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { resolveTripDestinationScope } from "@/lib/tripDestinationScope";
import { requireSessionUser } from "@/server/auth";
import { serverConfig } from "@/server/config";
import {
  fetchGooglePlaceDetailsByPlaceId,
  reverseGeocodeWithGoogle,
} from "@/server/geo/geocodeService";
import type { GeocodeApiResult } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    await requireSessionUser();
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
      lat?: number;
      lng?: number;
      region?: string;
    };

    const lat = typeof body.lat === "number" ? body.lat : Number(body.lat);
    const lng = typeof body.lng === "number" ? body.lng : Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        createError("invalid_request", "請提供有效的 lat 與 lng。"),
        { status: 400 },
      );
    }

    const destinationScope = resolveTripDestinationScope(body.region?.trim());
    const resolved = await reverseGeocodeWithGoogle(lat, lng, destinationScope);
    if (!resolved.ok) {
      return NextResponse.json(
        createError("reverse_geocode_failed", resolved.reason),
        { status: 422 },
      );
    }

    const addressName = resolved.result.formattedAddress.split(/[,，]/)[0]?.trim();
    let result: GeocodeApiResult = {
      ...resolved.result,
      types: resolved.result.types,
      name: addressName || undefined,
    };

    if (resolved.result.placeId) {
      const details = await fetchGooglePlaceDetailsByPlaceId(resolved.result.placeId);
      const formattedAddress =
        details.address?.trim() || resolved.result.formattedAddress;
      const nameFromAddress = formattedAddress.split(/[,，]/)[0]?.trim();
      result = {
        ...result,
        name: details.name?.trim() || nameFromAddress || undefined,
        formattedAddress,
        photoUrl: details.photoUrl,
        thumbnail: details.thumbnail || details.photoUrl,
        openingHours: details.openingHours,
        phoneNumber: details.phoneNumber,
        website: details.website,
        googleMapsUrl: details.googleMapsUrl,
        rating: details.rating,
        userRatingsTotal: details.userRatingsTotal,
      };
    }

    return NextResponse.json(createSuccess({ result }));
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(
      createError("internal_error", "反向地理編碼失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}
