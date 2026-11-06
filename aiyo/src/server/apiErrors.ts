import { NextResponse } from "next/server";
import { createError } from "@/lib/api-response";

export function toApiError(error: unknown, fallbackMessage: string) {
  if (error instanceof Error) {
    if (error.message === "unauthorized") {
      return NextResponse.json(createError("unauthorized", "Authentication required."), {
        status: 401,
      });
    }
    if (error.message === "forbidden") {
      return NextResponse.json(createError("forbidden", "你沒有權限存取此資源。"), { status: 403 });
    }
    if (error.message === "not_found") {
      return NextResponse.json(createError("not_found", "找不到請求的資源。"), { status: 404 });
    }
    if (error.message === "version_conflict") {
      return NextResponse.json(createError("version_conflict", "行程已被其他變更更新，請重新載入後再試。"), { status: 409 });
    }
    if (error.message === "idempotency_conflict") {
      return NextResponse.json(createError("idempotency_conflict", "這個請求識別碼已用於其他修改。"), { status: 409 });
    }
    if (error.message === "invalid_agent_proposal") {
      return NextResponse.json(createError("invalid_agent_proposal", "修改資料已失效，請重新預覽。"), { status: 422 });
    }
    if (error.message === "validation_error") {
      return NextResponse.json(createError("validation_error", "行程內容不符合公開條件。"), {
        status: 422,
      });
    }
  }

  return NextResponse.json(createError("internal_error", fallbackMessage), { status: 500 });
}

