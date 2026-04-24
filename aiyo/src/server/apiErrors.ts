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
      return NextResponse.json(createError("forbidden", "Forbidden."), { status: 403 });
    }
    if (error.message === "not_found") {
      return NextResponse.json(createError("not_found", "Resource not found."), { status: 404 });
    }
  }

  return NextResponse.json(createError("internal_error", fallbackMessage), { status: 500 });
}

