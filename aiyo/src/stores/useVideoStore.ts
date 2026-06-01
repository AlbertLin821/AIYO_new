import { create } from "zustand";
import {
  dedupeVideoRecommendations,
  INITIAL_VIDEO_RECOMMENDATIONS_LIMIT,
  limitInitialVideoRecommendations,
} from "@/lib/videoListLimits";
import type { CachedVideoRecommendations } from "@/lib/videoRecommendationCache";
import type { VideoRecommendation } from "@/types";

export type SummaryDiagnostics = {
  transcriptSource: "youtube" | "fallback-description" | "fallback-synthetic" | "none";
  summarySource?:
    | "ollama-transcript"
    | "heuristic-transcript-fallback"
    | "ollama-description-fallback"
    | "ollama-synthetic-fallback"
    | "unavailable";
  segmentSource?:
    | "transcript-chunks"
    | "deterministic-mentions"
    | "deterministic-mentions-json-polished"
    | "description-fallback"
    | "synthetic-fallback"
    | "unavailable";
  captionLanguage?: string;
  captionKind?: "manual" | "asr";
  captionSource?: "watch-page-captions" | "timedtext" | "youtube-transcript-package";
  mapsProvenance?: "google-geocoding" | "catalog-fallback" | "mixed";
  geocodeWarnings?: string[];
  summaryUnavailable?: boolean;
  unavailableReason?: string;
  fallbackReason?: string;
  failedChunkCount?: number;
};

export type VideoRecommendationRequest = {
  destination?: string;
  keyword?: string;
  days?: number;
  preferences?: string[];
  limit?: number;
};

export interface VideoState {
  videos: VideoRecommendation[];
  selectedVideo: VideoRecommendation | null;
  searchQuery: string;
  recommendationSource:
    | "youtube-data-api"
    | "mock-fallback"
    | "default-taiwan-cities"
    | "preloaded-destination-seed"
    | "single-video-url"
    | null;
  summaryDiagnostics: SummaryDiagnostics | null;
  lastRecommendationRequest: VideoRecommendationRequest | null;
  isSearching: boolean;
  isSummarizing: boolean;
  errorMessage: string | null;
  /** 使用者已按「更多影片」後，列表可超過 INITIAL_VIDEO_RECOMMENDATIONS_LIMIT */
  hasLoadedMoreVideos: boolean;
  /** Incremented when the home drawer closes so VideoSearchBar can clear URL text (not persisted). */
  searchBarResetNonce: number;
  recommendationCache: Record<string, CachedVideoRecommendations>;
  getCachedRecommendations: (queryKey: string) => CachedVideoRecommendations | null;
  setCachedRecommendations: (queryKey: string, entry: CachedVideoRecommendations) => void;
  setVideos: (videos: VideoRecommendation[]) => void;
  /** 重設推薦列表（搜尋／種子），最多 INITIAL_VIDEO_RECOMMENDATIONS_LIMIT 筆 */
  setInitialVideoList: (videos: VideoRecommendation[]) => void;
  /** 在現有列表後追加（「更多影片」），並標記已展開 */
  appendToVideoList: (incoming: VideoRecommendation[]) => void;
  /** 移除或替換指定格（維持列表長度，用於 dismiss） */
  replaceVideoAtIndex: (index: number, video: VideoRecommendation | null) => void;
  upsertVideo: (video: VideoRecommendation) => void;
  setSelectedVideo: (video: VideoRecommendation | null) => void;
  setSearchQuery: (query: string) => void;
  setRecommendationSource: (
    source:
      | "youtube-data-api"
      | "mock-fallback"
      | "default-taiwan-cities"
      | "preloaded-destination-seed"
      | "single-video-url"
      | null,
  ) => void;
  setSummaryDiagnostics: (value: SummaryDiagnostics | null) => void;
  setLastRecommendationRequest: (request: VideoRecommendationRequest | null) => void;
  setIsSearching: (searching: boolean) => void;
  setIsSummarizing: (summarizing: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  bumpSearchBarReset: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videos: [],
  selectedVideo: null,
  searchQuery: "",
  recommendationSource: null,
  summaryDiagnostics: null,
  lastRecommendationRequest: null,
  isSearching: false,
  isSummarizing: false,
  errorMessage: null,
  hasLoadedMoreVideos: false,
  searchBarResetNonce: 0,
  recommendationCache: {},
  getCachedRecommendations: (queryKey) => {
    const entry = get().recommendationCache[queryKey];
    return entry ?? null;
  },
  setCachedRecommendations: (queryKey, entry) =>
    set((state) => ({
      recommendationCache: {
        ...state.recommendationCache,
        [queryKey]: entry,
      },
    })),
  setVideos: (videos) =>
    set((state) => ({
      videos: state.hasLoadedMoreVideos
        ? videos
        : limitInitialVideoRecommendations(videos),
    })),
  setInitialVideoList: (videos) =>
    set({
      videos: limitInitialVideoRecommendations(videos),
      hasLoadedMoreVideos: false,
    }),
  appendToVideoList: (incoming) =>
    set((state) => ({
      videos: dedupeVideoRecommendations(state.videos, incoming),
      hasLoadedMoreVideos: true,
    })),
  replaceVideoAtIndex: (index, video) =>
    set((state) => {
      if (index < 0 || index >= state.videos.length) {
        return state;
      }
      const videos = [...state.videos];
      if (video) {
        videos[index] = video;
      } else {
        videos.splice(index, 1);
      }
      return {
        videos: state.hasLoadedMoreVideos
          ? videos
          : limitInitialVideoRecommendations(videos),
      };
    }),
  upsertVideo: (video) =>
    set((state) => {
      const existingIndex = state.videos.findIndex(
        (item) =>
          item.id === video.id ||
          (Boolean(item.videoId) && Boolean(video.videoId) && item.videoId === video.videoId),
      );
      if (existingIndex === -1) {
        if (
          !state.hasLoadedMoreVideos &&
          state.videos.length >= INITIAL_VIDEO_RECOMMENDATIONS_LIMIT
        ) {
          return state;
        }
        return { videos: [video, ...state.videos] };
      }
      const videos = [...state.videos];
      videos[existingIndex] = video;
      return { videos };
    }),
  setSelectedVideo: (selectedVideo) => set({ selectedVideo }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),
  setRecommendationSource: (recommendationSource) => set({ recommendationSource }),
  setSummaryDiagnostics: (summaryDiagnostics) => set({ summaryDiagnostics }),
  setLastRecommendationRequest: (lastRecommendationRequest) => set({ lastRecommendationRequest }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setIsSummarizing: (isSummarizing) => set({ isSummarizing }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  bumpSearchBarReset: () =>
    set((state) => ({
      searchBarResetNonce: state.searchBarResetNonce + 1,
    })),
}));
