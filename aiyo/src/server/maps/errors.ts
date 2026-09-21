export type MapErrorCode =
  | "MAP_LOAD_FAILED"
  | "MAP_SEARCH_FAILED"
  | "MAP_NEARBY_FAILED"
  | "MAP_ROUTE_FAILED"
  | "MAP_GEOCODE_FAILED";

export class MapServiceError extends Error {
  constructor(public readonly code: MapErrorCode, message: string, public readonly status = 502) {
    super(message);
    this.name = "MapServiceError";
  }
}

export function mapErrorResponse(error: unknown, fallback: MapErrorCode): Response {
  const known = error instanceof MapServiceError ? error : new MapServiceError(fallback, "地圖服務暫時無法使用。");
  return Response.json({ success: false, error: { code: known.code, message: known.message } }, { status: known.status });
}

