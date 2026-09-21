import { mapErrorResponse } from "@/server/maps/errors"; import { enforceMapRateLimit } from "@/server/maps/routeLimit"; import { mapService } from "@/server/maps/service"; import { parsePoints, parseProfile } from "@/server/maps/validation";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(request: Request) { const limited = enforceMapRateLimit(request); if (limited) return limited; try { const body = await request.json() as { points?: unknown; profile?: unknown }; const route = await mapService.getRoute(parsePoints(body.points), parseProfile(body.profile)); return Response.json({ success: true, data: { route } }); } catch (error) { return mapErrorResponse(error, "MAP_ROUTE_FAILED"); } }

