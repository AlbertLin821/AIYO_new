import { NextResponse } from "next/server";
import { isValidPhotoReference } from "@/lib/placePhotoUrl";
import { requireSessionUser } from "@/server/auth";
import { serverConfig } from "@/server/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireSessionUser();

    if (!serverConfig.googleMapsApiKey) {
      return new NextResponse(null, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const ref = searchParams.get("ref")?.trim();
    if (!ref || !isValidPhotoReference(ref)) {
      return new NextResponse(null, { status: 400 });
    }

    const maxwidthRaw = Number(searchParams.get("maxwidth"));
    const maxwidth = Math.min(
      1600,
      Math.max(1, Number.isFinite(maxwidthRaw) ? Math.floor(maxwidthRaw) : 480),
    );

    const params = new URLSearchParams({
      maxwidth: String(maxwidth),
      photo_reference: ref,
      key: serverConfig.googleMapsApiKey,
    });
    const googleUrl = `https://maps.googleapis.com/maps/api/place/photo?${params.toString()}`;

    const response = await fetch(googleUrl, { cache: "no-store", redirect: "follow" });
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
    if (error instanceof Error && error.message === "unauthorized") {
      return new NextResponse(null, { status: 401 });
    }
    console.error("[map-place-photo] failed", error);
    return new NextResponse(null, { status: 500 });
  }
}
