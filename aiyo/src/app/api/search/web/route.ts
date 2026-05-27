import { NextResponse } from "next/server";
import { createError } from "@/lib/api-response";
import { requireSessionUser } from "@/server/auth";
import { handleWebSearchRequest } from "@/app/api/search/web/handleWebSearch";

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
    await requireSessionUser();
    const body = (await request.json()) as SearchBody;
    const result = await handleWebSearchRequest(body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Error && error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "請先登入。"), { status: 401 });
    }
    return NextResponse.json(
      createError("search_failed", "搜尋服務暫時不可用。"),
      { status: 502 },
    );
  }
}
