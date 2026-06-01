import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { getTravelArticles } from "@/server/services/travelArticlesService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("q") || searchParams.get("query") || undefined;
    const limit = Number(searchParams.get("limit") || 8);
    const refreshSeed = Number(searchParams.get("seed") || 0);
    const excludeRaw = searchParams.get("exclude") || "";
    const excludeIds = excludeRaw
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    const result = await getTravelArticles({
      query,
      limit,
      refreshSeed: Number.isFinite(refreshSeed) ? refreshSeed : 0,
      excludeIds: excludeIds.length ? excludeIds : undefined,
    });
    return NextResponse.json(
      createSuccess(result.articles, {
        sources: result.sources,
        fallbackUsed: result.fallbackUsed,
      }),
    );
  } catch {
    return NextResponse.json(
      createError("travel_articles_failed", "旅遊文章暫時無法載入。"),
      { status: 502 },
    );
  }
}
