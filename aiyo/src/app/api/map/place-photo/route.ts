import { NextResponse } from "next/server";
import { isValidPhotoReference } from "@/lib/placePhotoUrl";
import { serverConfig } from "@/server/config";
import { fetchGooglePlaceDetailsByPlaceId } from "@/server/geo/geocodeService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function extractRefFromProxyUrl(url?: string): string | null {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url, "http://localhost");
    const ref = parsed.searchParams.get("ref")?.trim();
    return ref && isValidPhotoReference(ref) ? ref : null;
  } catch {
    return null;
  }
}

async function fetchGooglePlacePhoto(ref: string, maxwidth: number): Promise<Response> {
  const params = new URLSearchParams({
    maxwidth: String(maxwidth),
    photo_reference: ref,
    key: serverConfig.googleMapsApiKey,
  });
  const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;
  return await fetch(googleUrl, { cache: "no-store", redirect: "follow" });
}

export async function GET(request: Request) {
  try {
    if (!serverConfig.googleMapsApiKey) {
      return new NextResponse(null, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get("ref")?.trim();
    const placeId = searchParams.get("placeId")?.trim();
    if (!ref || !isValidPhotoReference(ref)) {
      return new NextResponse(null, { status: 400 });
    }

    const maxwidthRaw = Number(searchParams.get("maxwidth"));
    const maxwidth = Math.min(
      1600,
      Math.max(1, Number.isFinite(maxwidthRaw) ? Math.floor(maxwidthRaw) : 480),
    );

    let response = await fetchGooglePlacePhoto(ref, maxwidth);
    if (!response.ok && placeId) {
      const freshDetails = await fetchGooglePlaceDetailsByPlaceId(placeId);
      const freshRef = extractRefFromProxyUrl(freshDetails.photoUrl);
      if (freshRef && freshRef !== ref) {
        response = await fetchGooglePlacePhoto(freshRef, maxwidth);
      }
    }
    if (!response.ok) {
      return new NextResponse(null, { status: response.status === 404 ? 404 : 502 });
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const body = response.body;
    if (!body) {
      return new NextResponse(null, { status: 502 });
    }

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (error) {
    console.error("[map-place-photo] failed", error);
    return new NextResponse(null, { status: 500 });
  }
}
