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
  captionSource?:
    | "watch-page-captions"
    | "timedtext"
    | "youtube-transcript-package"
    | "yt-dlp-vtt";
  mapsProvenance?: "google-geocoding" | "catalog-fallback" | "mixed";
  geocodeWarnings?: string[];
  summaryUnavailable?: boolean;
  unavailableReason?: string;
  fallbackReason?: string;
  failedChunkCount?: number;
};

export type VideoSummaryStatus = "queued" | "running";

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
  summaryDiagnosticsByVideoKey: Record<string, SummaryDiagnostics | undefined>;
  lastRecommendationRequest: VideoRecommendationRequest | null;
  isSearching: boolean;
  isSummarizing: boolean;
  summaryStatusByVideoKey: Record<string, VideoSummaryStatus | undefined>;
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
  getSummaryDiagnosticsForVideo: (videoKey?: string | null) => SummaryDiagnostics | null;
  setSummaryDiagnosticsForVideo: (
    videoKey: string,
    value: SummaryDiagnostics | null,
  ) => void;
  clearSummaryDiagnosticsForVideo: (videoKey?: string | null) => void;
  setLastRecommendationRequest: (request: VideoRecommendationRequest | null) => void;
  setIsSearching: (searching: boolean) => void;
  setIsSummarizing: (summarizing: boolean) => void;
  getVideoSummaryStatus: (videoKey?: string | null) => VideoSummaryStatus | null;
  setVideoSummaryStatus: (videoKey: string, status: VideoSummaryStatus) => void;
  clearVideoSummaryStatus: (videoKey?: string | null) => void;
  setErrorMessage: (message: string | null) => void;
  bumpSearchBarReset: () => void;
}

export const useVideoStore = create<VideoState>((set, get) => ({
  videos: [],
  selectedVideo: null,
  searchQuery: "",
  recommendationSource: null,
  summaryDiagnostics: null,
  summaryDiagnosticsByVideoKey: {},
  lastRecommendationRequest: null,
  isSearching: false,
  isSummarizing: false,
  summaryStatusByVideoKey: {},
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
  getSummaryDiagnosticsForVideo: (videoKey) => {
    if (!videoKey) {
      return null;
    }
    return get().summaryDiagnosticsByVideoKey[videoKey] ?? null;
  },
  setSummaryDiagnosticsForVideo: (videoKey, value) =>
    set((state) => {
      const next = { ...state.summaryDiagnosticsByVideoKey };
      if (value) {
        next[videoKey] = value;
      } else {
        delete next[videoKey];
      }
      return { summaryDiagnosticsByVideoKey: next };
    }),
  clearSummaryDiagnosticsForVideo: (videoKey) =>
    set((state) => {
      if (!videoKey || !(videoKey in state.summaryDiagnosticsByVideoKey)) {
        return state;
      }
      const next = { ...state.summaryDiagnosticsByVideoKey };
      delete next[videoKey];
      return { summaryDiagnosticsByVideoKey: next };
    }),
  setLastRecommendationRequest: (lastRecommendationRequest) => set({ lastRecommendationRequest }),
  setIsSearching: (isSearching) => set({ isSearching }),
  setIsSummarizing: (isSummarizing) => set({ isSummarizing }),
  getVideoSummaryStatus: (videoKey) => {
    if (!videoKey) {
      return null;
    }
    return get().summaryStatusByVideoKey[videoKey] ?? null;
  },
  setVideoSummaryStatus: (videoKey, status) =>
    set((state) => ({
      summaryStatusByVideoKey: {
        ...state.summaryStatusByVideoKey,
        [videoKey]: status,
      },
    })),
  clearVideoSummaryStatus: (videoKey) =>
    set((state) => {
      if (!videoKey || !(videoKey in state.summaryStatusByVideoKey)) {
        return state;
      }
      const next = { ...state.summaryStatusByVideoKey };
      delete next[videoKey];
      return { summaryStatusByVideoKey: next };
    }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  bumpSearchBarReset: () =>
    set((state) => ({
      searchBarResetNonce: state.searchBarResetNonce + 1,
    })),
}));
