import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { toApiError } from "@/server/apiErrors";
import { requireSessionUser } from "@/server/auth";
import { retrieveRelevantMemoriesForUser } from "@/server/memory/memoryRetrieval";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  query?: string;
  topK?: number;
};

export async function POST(request: Request) {
  try {
    const { userId } = await requireSessionUser();
    const body = (await request.json()) as Body;
    const query = body.query?.trim() || "";
    if (!query) {
      return NextResponse.json(createError("invalid_request", "query 不能為空。"), { status: 400 });
    }
    const topK = typeof body.topK === "number" && Number.isFinite(body.topK) ? body.topK : undefined;
    const { memories, mode } = await retrieveRelevantMemoriesForUser({ userId, query, topK });
    return NextResponse.json(
      createSuccess({
        query,
        mode,
        memories,
      }),
    );
  } catch (error) {
    return toApiError(error, "Failed to retrieve memories.");
  }
}
