import { create } from "zustand";
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
};

export type VideoRecommendationRequest = {
  destination?: string;
  keyword?: string;
  days?: number;
  preferences?: string[];
  limit?: number;
};

interface VideoState {
  videos: VideoRecommendation[];
  selectedVideo: VideoRecommendation | null;
  searchQuery: string;
  recommendationSource:
    | "youtube-data-api"
    | "mock-fallback"
    | "default-taiwan-cities"
    | "single-video-url"
    | null;
  summaryDiagnostics: SummaryDiagnostics | null;
  lastRecommendationRequest: VideoRecommendationRequest | null;
  isSearching: boolean;
  isSummarizing: boolean;
  errorMessage: string | null;
  /** Incremented when the home drawer closes so VideoSearchBar can clear URL text (not persisted). */
  searchBarResetNonce: number;
  setVideos: (videos: VideoRecommendation[]) => void;
  upsertVideo: (video: VideoRecommendation) => void;
  setSelectedVideo: (video: VideoRecommendation | null) => void;
  setSearchQuery: (query: string) => void;
  setRecommendationSource: (
    source: "youtube-data-api" | "mock-fallback" | "default-taiwan-cities" | "single-video-url" | null,
  ) => void;
  setSummaryDiagnostics: (value: SummaryDiagnostics | null) => void;
  setLastRecommendationRequest: (request: VideoRecommendationRequest | null) => void;
  setIsSearching: (searching: boolean) => void;
  setIsSummarizing: (summarizing: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  bumpSearchBarReset: () => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  videos: [],
  selectedVideo: null,
  searchQuery: "",
  recommendationSource: null,
  summaryDiagnostics: null,
  lastRecommendationRequest: null,
  isSearching: false,
  isSummarizing: false,
  errorMessage: null,
  searchBarResetNonce: 0,
  setVideos: (videos) => set({ videos }),
  upsertVideo: (video) =>
    set((state) => {
      const existingIndex = state.videos.findIndex((item) => item.id === video.id);
      if (existingIndex === -1) {
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
