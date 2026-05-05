import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readString(name: string): string {
  return process.env[name]?.trim() || "";
}

function readBoolean(...names: string[]): boolean {
  return names.some((name) => readString(name).toLowerCase() === "true");
}

function normalizeMapId(value: string): string {
  if (!value || /NEXT_PUBLIC_|GOOGLE_MAPS_API_KEY|Frontend_/i.test(value)) {
    return "";
  }
  return value;
}

export async function GET() {
  return NextResponse.json({
    googleMapsApiKey: readString("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"),
    googleMapsMapId: normalizeMapId(readString("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID")),
    enableMockMaps: readBoolean("NEXT_PUBLIC_ENABLE_MOCK_MAPS", "ENABLE_MOCK_MAPS"),
  });
}
