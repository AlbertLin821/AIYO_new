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
    if (error.message === "validation_error") {
      return NextResponse.json(createError("validation_error", "行程內容不符合公開條件。"), {
        status: 422,
      });
    }
  }

  return NextResponse.json(createError("internal_error", fallbackMessage), { status: 500 });
}

