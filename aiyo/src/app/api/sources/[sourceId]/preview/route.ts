import { NextResponse } from "next/server";
import { createError, createSuccess } from "@/lib/api-response";
import { getChatSourcePreview } from "@/server/chat/sourcePreviewStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ sourceId: string }> },
) {
  const { sourceId } = await context.params;
  const source = getChatSourcePreview(sourceId);
  if (!source) {
    return NextResponse.json(createError("source_not_found", "找不到來源預覽。"), {
      status: 404,
    });
  }
  return NextResponse.json(createSuccess(source));
}
