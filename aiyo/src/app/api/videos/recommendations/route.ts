import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { getVideoRecommendations } from "@/server/services/videoRecommendationService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const destination = searchParams.get("destination") || undefined;
    const keyword = searchParams.get("keyword") || undefined;
    const days = searchParams.get("days") ? Number(searchParams.get("days")) : undefined;
    const preferences = searchParams.get("preferences")?.split(",").map((item) => item.trim()).filter(Boolean);
    const limit = Number(searchParams.get("limit") || 6);
    const offset = Number(searchParams.get("offset") || 0);
    const excludeVideoIds = searchParams
      .get("excludeVideoIds")
      ?.split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const outcome = await getVideoRecommendations({
      destination,
      keyword,
      days,
      preferences,
      limit,
      offset,
      excludeVideoIds,
    });
    return NextResponse.json(
      createSuccess(outcome.videos, {
        source: outcome.source,
        fallbackReason: outcome.fallbackReason,
        debug: outcome.debug,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      createError(
        "internal_error",
        "Failed to fetch video recommendations.",
        error instanceof Error ? error.message : undefined,
      ),
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      destination?: string;
      keyword?: string;
      days?: number;
      preferences?: string[];
      travelStyle?: string;
      budget?: string;
      companions?: string[];
      limit?: number;
      offset?: number;
      excludeVideoIds?: string[];
    };
    const outcome = await getVideoRecommendations(body);
    return NextResponse.json(
      createSuccess(outcome.videos, {
        source: outcome.source,
        fallbackReason: outcome.fallbackReason,
        debug: outcome.debug,
      }),
    );
  } catch (error) {
    return NextResponse.json(
      createError(
        "internal_error",
        "Failed to fetch video recommendations.",
        error instanceof Error ? error.message : undefined,
      ),
      { status: 500 },
    );
  }
}
