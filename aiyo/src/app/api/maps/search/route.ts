import { mapErrorResponse, MapServiceError } from "@/server/maps/errors";
import { enforceMapRateLimit } from "@/server/maps/routeLimit";
import { mapService } from "@/server/maps/service";
import { parsePoint } from "@/server/maps/validation";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const limited = enforceMapRateLimit(request); if (limited) return limited;
  try {
    const p = new URL(request.url).searchParams; const query = p.get("q")?.trim() || "";
    if (query.length < 2 || query.length > 120) throw new MapServiceError("MAP_SEARCH_FAILED", "搜尋文字長度必須介於 2 到 120 字元。", 400);
    const near = p.has("lat") || p.has("lng") ? parsePoint(p.get("lat"), p.get("lng")) : undefined;
    const results = await mapService.searchPlaces(query, { limit: Number(p.get("limit")) || 6, language: p.get("language") || undefined, near });
    return Response.json({ success: true, data: { results } });
  } catch (error) { return mapErrorResponse(error, "MAP_SEARCH_FAILED"); }
}

