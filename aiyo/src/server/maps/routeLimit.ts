import { InMemoryRateLimiter } from "@/server/http/inMemoryRateLimiter";

const limiter = new InMemoryRateLimiter(90, 60_000, Date.now, 2_000);

export function mapRequestIdentity(request: Request): string {
  return request.headers.get("x-real-ip")?.trim() || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "anonymous";
}

export function enforceMapRateLimit(request: Request): Response | null {
  const result = limiter.consume(mapRequestIdentity(request));
  if (result.allowed) return null;
  return Response.json({ success: false, error: { code: "MAP_RATE_LIMITED", message: "地圖服務請求過於頻繁，請稍後再試。" } }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
}
