import { isApiError } from "@/lib/api-response";
import { zhTW as t } from "@/locales/zh-TW";
import type { ApiResponse } from "@/types";

export class ApiRequestError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    Object.setPrototypeOf(this, ApiRequestError.prototype);
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload)
      ? payload.error.message
      : `Request failed with status ${response.status}`;
    const code = isApiError(payload) ? payload.error.code : undefined;
    throw new ApiRequestError(message, response.status, code);
  }
  return payload.data;
}

async function parseResponseWithMeta<T>(
  response: Response,
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  const payload = (await response.json()) as ApiResponse<T>;
  if (!response.ok || isApiError(payload)) {
    const message = isApiError(payload)
      ? payload.error.message
      : `Request failed with status ${response.status}`;
    const code = isApiError(payload) ? payload.error.code : undefined;
    throw new ApiRequestError(message, response.status, code);
  }
  return { data: payload.data, meta: payload.meta };
}

function mergeAbortSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([a, b]);
  }
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (a.aborted || b.aborted) {
    controller.abort();
    return controller.signal;
  }
  a.addEventListener("abort", onAbort);
  b.addEventListener("abort", onAbort);
  return controller.signal;
}

export async function apiGet<T>(path: string): Promise<T> {
  try {
    const response = await fetch(path, {
      method: "GET",
      cache: "no-store",
      credentials: "include",
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
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<TResponse> {
  const timeoutMs = options?.timeoutMs;
  const outerSignal = options?.signal;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let signal: AbortSignal | undefined;
  if (outerSignal && timeoutMs != null && timeoutMs > 0) {
    signal = mergeAbortSignals(outerSignal, controller.signal);
  } else if (outerSignal) {
    signal = outerSignal;
  } else if (timeoutMs != null && timeoutMs > 0) {
    signal = controller.signal;
  }

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
      ...(signal ? { signal } : {}),
    });
    return parseResponse<TResponse>(response);
  } catch (error) {
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError");
    if (isAbort) {
      if (outerSignal?.aborted) {
        throw error;
      }
      throw new Error(t.api.planTimeout);
    }
    if (error instanceof ApiRequestError) {
      throw error;
    }
    throw new Error(
      error instanceof Error ? error.message : t.api.postFailed,
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function apiPostWithMeta<TRequest, TResponse>(
  path: string,
  body: TRequest,
  options?: { timeoutMs?: number; signal?: AbortSignal },
): Promise<{ data: TResponse; meta?: Record<string, unknown> }> {
  const timeoutMs = options?.timeoutMs;
  const outerSignal = options?.signal;
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  if (timeoutMs != null && timeoutMs > 0) {
    timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  }

  let signal: AbortSignal | undefined;
  if (outerSignal && timeoutMs != null && timeoutMs > 0) {
    signal = mergeAbortSignals(outerSignal, controller.signal);
  } else if (outerSignal) {
    signal = outerSignal;
  } else if (timeoutMs != null && timeoutMs > 0) {
    signal = controller.signal;
  }

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
      ...(signal ? { signal } : {}),
    });
    return parseResponseWithMeta<TResponse>(response);
  } catch (error) {
    const isAbort =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof DOMException !== "undefined" && error instanceof DOMException && error.name === "AbortError");
    if (isAbort) {
      if (outerSignal?.aborted) {
        throw error;
      }
      throw new Error(t.api.planTimeout);
    }
    if (error instanceof ApiRequestError) {
      throw error;
    }
    throw new Error(
      error instanceof Error ? error.message : t.api.postFailed,
    );
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function apiPut<TRequest, TResponse>(
  path: string,
  body: TRequest,
  options?: { keepalive?: boolean },
): Promise<TResponse> {
  try {
    const response = await fetch(path, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
      ...(options?.keepalive ? { keepalive: true as boolean } : {}),
    });
    return parseResponse<TResponse>(response);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t.api.putFailed,
    );
  }
}

export async function apiPatch<TRequest, TResponse>(
  path: string,
  body: TRequest,
): Promise<TResponse> {
  try {
    const response = await fetch(path, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      credentials: "include",
    });
    return parseResponse<TResponse>(response);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t.api.putFailed,
    );
  }
}

export async function apiDelete<TResponse>(path: string): Promise<TResponse> {
  try {
    const response = await fetch(path, {
      method: "DELETE",
      credentials: "include",
    });
    return parseResponse<TResponse>(response);
  } catch (error) {
    throw new Error(
      error instanceof Error ? error.message : t.api.postFailed,
    );
  }
}
