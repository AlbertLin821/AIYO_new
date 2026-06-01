import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { runGoogleMapsSetupCheck } from "@/server/geo/googleMapsSetupCheck";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Dev-friendly probe: which Google APIs accept the configured key (no secrets returned). */
export async function GET() {
  const result = await runGoogleMapsSetupCheck();
  return NextResponse.json(createSuccess(result));
}
