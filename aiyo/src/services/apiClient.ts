import { isApiError } from "@/lib/api-response";
import { zhTW as t } from "@/locales/zh-TW";
import type { ApiResponse } from "@/types";

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || isApiError(payload)) {
    throw new Error(
      isApiError(payload)
        ? payload.error.message
        : `Request failed with status ${response.status}`,
    );
  }
  return payload.data;
}

export async function apiGet<T>(path: string): Promise<T> {
  try {
    const response = await fetch(path, {
      method: "GET",
      cache: "no-store",
    });
    return parseResponse<T>(response);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t.api.getFailed,
    );
  }
}

export async function apiPost<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<TResponse> {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return parseResponse<TResponse>(response);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t.api.postFailed,
    );
  }
}

export async function apiPut<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<TResponse> {
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    return parseResponse<TResponse>(response);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t.api.putFailed,
    );
  }
}
