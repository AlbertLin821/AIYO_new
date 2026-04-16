import type { ApiError, ApiSuccess } from "@/types";

export function createSuccess<T>(
  data: T,
  meta?: Record<string, unknown>,
): ApiSuccess<T> {
  return { success: true, data, meta };
}

export function createError(
  code: string,
  message: string,
  details?: unknown,
): ApiError {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

export function isApiError<T>(
  response: ApiSuccess<T> | ApiError,
): response is ApiError {
  return response.success === false;
}
