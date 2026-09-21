import { mapErrorResponse } from "@/server/maps/errors";
import { enforceMapRateLimit } from "@/server/maps/routeLimit";
import { mapService } from "@/server/maps/service";
import { parsePoint } from "@/server/maps/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const limited = enforceMapRateLimit(request);
  if (limited) return limited;
  try {
    const p = new URL(request.url).searchParams;
    const result = await mapService.reverseGeocode(
      parsePoint(p.get("lat"), p.get("lng")),
      p.get("language") || undefined,
    );
    return Response.json({ success: true, data: { result } });
  } catch (error) {
    return mapErrorResponse(error, "MAP_GEOCODE_FAILED");
  }
}
