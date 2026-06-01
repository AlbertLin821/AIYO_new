import { createError, createSuccess } from "@/lib/api-response";
import { runUnifiedWebSearch } from "@/server/search/webSearchService";
import type { ApiError, ApiSuccess } from "@/types";
import type { WebSearchResult } from "@/server/search/webSearchTypes";

export type WebSearchBody = {
  query?: string;
  language?: string;
  categories?: string;
  limit?: number;
};

export type WebSearchResponseData = {
  query: string;
  results: WebSearchResult[];
  provider: Awaited<ReturnType<typeof runUnifiedWebSearch>>["backend"];
};

export type WebSearchHandlerResult =
  | { ok: true; status: 200; body: ApiSuccess<WebSearchResponseData> }
  | { ok: false; status: 400 | 502; body: ApiError };

export async function handleWebSearchRequest(body: WebSearchBody): Promise<WebSearchHandlerResult> {
  const query = body.query?.trim() || "";
  if (!query) {
    return {
      ok: false,
      status: 400,
      body: createError("invalid_request", "query 不能為空。"),
    };
  }

  const limit = Math.min(10, Math.max(1, Number(body.limit || 8)));
  try {
    const { results, backend } = await runUnifiedWebSearch({
      query,
      language: body.language,
      categories: body.categories,
      limit,
    });
    return {
      ok: true,
      status: 200,
      body: createSuccess({
        query,
        results,
        provider: backend,
      }),
    };
  } catch {
    return {
      ok: false,
      status: 502,
      body: createError("search_failed", "搜尋服務暫時不可用。"),
    };
  }
}
