import { NextResponse } from "next/server";
import { z } from "zod";
import { createError } from "@/lib/api-response";
import { POST as applyPreview } from "../preview/[previewId]/apply/route";
import { mutationRequestSchema } from "@/server/agent/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = mutationRequestSchema.extend({ previewId: z.string().min(1).max(100) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(createError("validation_error", "確認預覽輸入格式不正確。"), { status: 400 });
  const { id } = await context.params;
  const { previewId, ...body } = parsed.data;
  const forwarded = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return applyPreview(forwarded, { params: Promise.resolve({ id, previewId }) });
}
