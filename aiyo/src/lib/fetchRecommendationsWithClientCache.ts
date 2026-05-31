import {
  buildRecommendationQueryKey,
  isRecommendationCacheFresh,
  type VideoRecommendationRequestInput,
} from "@/lib/videoRecommendationCache";
import {
  fetchVideoRecommendations,
  type VideoRecommendationsClientResult,
} from "@/services/videoClient";
import { useVideoStore } from "@/stores/useVideoStore";

export type RecommendationFetchOutcome = VideoRecommendationsClientResult & {
  servedFromCache: boolean;
  cacheStatus: "miss" | "fresh-hit" | "stale-hit";
};

function persistRecommendationCache(
  queryKey: string,
  outcome: VideoRecommendationsClientResult,
): void {
  useVideoStore.getState().setCachedRecommendations(queryKey, {
    videos: outcome.videos,
    source: outcome.source,
    fallbackReason: outcome.fallbackReason,
    fetchedAt: Date.now(),
  });
}

function mapCachedToOutcome(
  cached: NonNullable<ReturnType<ReturnType<typeof useVideoStore.getState>["getCachedRecommendations"]>>,
): VideoRecommendationsClientResult {
  return {
    videos: cached.videos,
    source: cached.source,
    fallbackReason: cached.fallbackReason,
  };
}

export async function fetchRecommendationsWithClientCache(
  input: VideoRecommendationRequestInput,
  options?: {
    onBackgroundUpdate?: (outcome: VideoRecommendationsClientResult) => void;
  },
): Promise<RecommendationFetchOutcome> {
  const queryKey = buildRecommendationQueryKey(input);
  const cached = useVideoStore.getState().getCachedRecommendations(queryKey);

  if (cached && isRecommendationCacheFresh(cached)) {
    return {
      ...mapCachedToOutcome(cached),
      servedFromCache: true,
      cacheStatus: "fresh-hit",
    };
  }

  if (cached) {
    void fetchVideoRecommendations(input)
      .then((outcome) => {
        persistRecommendationCache(queryKey, outcome);
        options?.onBackgroundUpdate?.(outcome);
      })
      .catch(() => undefined);

    return {
      ...mapCachedToOutcome(cached),
      servedFromCache: true,
      cacheStatus: "stale-hit",
    };
  }

  const outcome = await fetchVideoRecommendations(input);
  persistRecommendationCache(queryKey, outcome);
  return {
    ...outcome,
    servedFromCache: false,
    cacheStatus: "miss",
  };
}
