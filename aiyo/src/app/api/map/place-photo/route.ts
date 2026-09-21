import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy Google photo URLs are intentionally retired after the OSM migration. */
export async function GET() {
  return new NextResponse(null, { status: 410, headers: { "Cache-Control": "public, max-age=86400" } });
}
