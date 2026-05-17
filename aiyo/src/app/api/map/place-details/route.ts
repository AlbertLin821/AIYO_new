import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { serverConfig } from "@/server/config";
import { fetchGooglePlaceDetailsByPlaceId } from "@/server/geo/geocodeService";
import { searchPlacesByText, type PlaceSearchHit } from "@/server/geo/placesSearchService";
import type { LocationReference } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PlaceDetailsRequestItem = {
  id?: string;
  name?: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  address?: string;
};

function distanceScore(
  target: { lat?: number; lng?: number },
  candidate: { lat: number; lng: number },
): number {
  if (!Number.isFinite(target.lat) || !Number.isFinite(target.lng)) {
    return 0;
  }
  const dLat = Math.abs((target.lat || 0) - candidate.lat);
  const dLng = Math.abs((target.lng || 0) - candidate.lng);
  return dLat + dLng;
}

function placeHitToLocationPatch(hit: PlaceSearchHit): Partial<LocationReference> {
  return {
    name: hit.name,
    lat: hit.lat,
    lng: hit.lng,
    description: hit.formattedAddress,
    address: hit.formattedAddress,
    placeId: hit.placeId,
    photoUrl: hit.photoUrl,
    thumbnail: hit.photoUrl,
    openingHours: hit.openingHours,
    phoneNumber: hit.phoneNumber,
    website: hit.website,
    googleMapsUrl: hit.googleMapsUrl,
    rating: hit.rating,
    userRatingsTotal: hit.userRatingsTotal,
    verified: true,
  };
}

async function resolvePlaceDetails(
  item: PlaceDetailsRequestItem,
  region?: string,
): Promise<Partial<LocationReference>> {
  if (item.placeId) {
    const details = await fetchGooglePlaceDetailsByPlaceId(item.placeId);
    if (Object.values(details).some((value) => value !== undefined)) {
      return {
        ...details,
        placeId: item.placeId,
        verified: true,
      };
    }
  }

  const name = item.name?.trim();
  if (!name) {
    return {};
  }

  const queryParts = [name, item.address?.trim()].filter(Boolean);
  const searched = await searchPlacesByText(queryParts.join(" "), region, { maxResults: 5 });
  if (!searched.ok || searched.places.length === 0) {
    console.warn(`[map-place-details] search failed for "${name}": ${searched.ok ? "empty" : searched.reason}`);
    return {};
  }

  const best = [...searched.places].sort(
    (left, right) => distanceScore(item, left) - distanceScore(item, right),
  )[0];
  return best ? placeHitToLocationPatch(best) : {};
}

export async function POST(request: Request) {
  try {
    if (!serverConfig.googleMapsApiKey) {
      return NextResponse.json(
        createError("maps_key_missing", "未設定 GOOGLE_MAPS_API_KEY，無法取得地點詳細資料。"),
        { status: 400 },
      );
    }

    const body = (await request.json()) as {
      places?: PlaceDetailsRequestItem[];
      region?: string;
    };
    const places = Array.isArray(body.places) ? body.places.slice(0, 12) : [];
    if (places.length === 0) {
      return NextResponse.json(
        createError("invalid_request", "請提供 places 陣列。"),
        { status: 400 },
      );
    }

    const results = await Promise.all(
      places.map(async (item) => ({
        id: item.id,
        name: item.name,
        placeId: item.placeId,
        details: await resolvePlaceDetails(item, body.region),
      })),
    );

    return NextResponse.json(createSuccess({ results }));
  } catch (error) {
    console.error("[map-place-details] failed", error);
    return NextResponse.json(
      createError("internal_error", "取得地點詳細資料失敗，請稍後再試。"),
      { status: 500 },
    );
  }
}
