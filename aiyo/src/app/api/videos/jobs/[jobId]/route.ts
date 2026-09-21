import { NextResponse } from "next/server";
import { requireSessionUser } from "@/server/auth";
import { readVideoJob } from "@/server/jobs/videoJobs";
import { createError, createSuccess } from "@/lib/api-response";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const { userId } = await requireSessionUser();
    const { jobId } = await context.params;
    const job = await readVideoJob(userId, jobId);
    return NextResponse.json(job ? createSuccess(job) : createError("not_found", "找不到分析任務。"), { status: job ? 200 : 404, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const unauthorized = error instanceof Error && error.message === "unauthorized";
    return NextResponse.json(createError(unauthorized ? "unauthorized" : "unavailable", unauthorized ? "請先登入。" : "暫時無法讀取分析進度。"), { status: unauthorized ? 401 : 503 });
  }
}
