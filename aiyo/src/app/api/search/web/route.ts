import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { searchWeb } from "@/server/search/searxngClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SearchBody = {
  query?: string;
  language?: string;
  categories?: string;
  limit?: number;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SearchBody;
    const query = body.query?.trim() || "";
    if (!query) {
      return NextResponse.json(
        createError("invalid_request", "query 不能為空。"),
        { status: 400 },
      );
    }

    const limit = Math.min(10, Math.max(1, Number(body.limit || 8)));
    const results = await searchWeb({
      query,
      language: body.language,
      categories: body.categories,
      limit,
    });

    return NextResponse.json(
      createSuccess({
        query,
        results,
      }),
    );
  } catch {
    return NextResponse.json(
      createError("search_failed", "搜尋服務暫時不可用。"),
      { status: 502 },
    );
  }
}
