import { NextResponse } from "next/server";
import { createSuccess } from "@/lib/api-response";
import { mapServiceConfig } from "@/server/maps/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Backward-compatible setup endpoint for the keyless OSM map stack. */
export async function GET() {
  return NextResponse.json(
    createSuccess({
      provider: "osm",
      configured: true,
      services: {
        photon: mapServiceConfig.photonBaseUrl,
        overpass: mapServiceConfig.overpassBaseUrl,
        osrm: mapServiceConfig.osrmBaseUrl,
      },
    }),
  );
}
