import { NextResponse } from "next/server";
import { z } from "zod";
import { createError } from "@/lib/api-response";
import { mutationRequestSchema } from "@/server/agent/schemas";
import { POST as undoMutation } from "../[mutationId]/undo/route";
import { POST as redoMutation } from "../[mutationId]/redo/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const inputSchema = mutationRequestSchema.extend({ mutationId: z.string().min(1).max(100), action: z.enum(["undo", "redo"]) });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json(createError("validation_error", "行程修改請求格式不正確。"), { status: 400 });
  const { id } = await context.params;
  const { mutationId, action, ...body } = parsed.data;
  const forwarded = new Request(request.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return action === "undo"
    ? undoMutation(forwarded, { params: Promise.resolve({ id, mutationId }) })
    : redoMutation(forwarded, { params: Promise.resolve({ id, mutationId }) });
}
