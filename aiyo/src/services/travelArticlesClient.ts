import { isApiError } from "@/lib/api-response";
import type { TravelArticle } from "@/types/travelArticle";
import type { ApiResponse } from "@/types";

export async function fetchTravelArticles(params?: {
  query?: string;
  limit?: number;
  refreshSeed?: number;
  excludeIds?: string[];
}): Promise<{
  articles: TravelArticle[];
  sources: string[];
  fallbackUsed: boolean;
}> {
  const searchParams = new URLSearchParams();
  if (params?.query?.trim()) {
    searchParams.set("q", params.query.trim());
  }
  if (params?.limit) {
    searchParams.set("limit", String(params.limit));
  }
  if (params?.refreshSeed && params.refreshSeed > 0) {
    searchParams.set("seed", String(params.refreshSeed));
  }
  if (params?.excludeIds?.length) {
    searchParams.set("exclude", params.excludeIds.join(","));
  }

  const suffix = searchParams.toString();
  const response = await fetch(`/api/articles/travel${suffix ? `?${suffix}` : ""}`);
  const payload = (await response.json()) as ApiResponse<TravelArticle[]>;

  if (!response.ok || isApiError(payload)) {
    throw new Error(
      isApiError(payload) ? payload.error.message : "旅遊文章暫時無法載入。",
    );
  }

  return {
    articles: payload.data,
    sources: (payload.meta?.sources as string[] | undefined) ?? [],
    fallbackUsed: Boolean(payload.meta?.fallbackUsed),
  };
}
