import { resolveGoogleMapsApiKey, resolveGoogleMapsMapId } from "@/lib/googleMapsEnv";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(name: string): string {
  return process.env[name]?.trim() || "";
}

function readBoolean(...names: string[]): boolean {
  return names.some((name) => readString(name).toLowerCase() === "true");
}

export async function GET() {
  return NextResponse.json({
    googleMapsApiKey: resolveGoogleMapsApiKey(),
    googleMapsMapId: resolveGoogleMapsMapId(),
    enableMockMaps: readBoolean("NEXT_PUBLIC_ENABLE_MOCK_MAPS", "ENABLE_MOCK_MAPS"),
    googleAuthEnabled: Boolean(readString("GOOGLE_CLIENT_ID") && readString("GOOGLE_CLIENT_SECRET")),
  });
}
