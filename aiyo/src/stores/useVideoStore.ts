import { create } from "zustand";
import type { VideoRecommendation } from "@/types";

export type SummaryDiagnostics = {
  transcriptSource: "youtube" | "fallback-description" | "fallback-synthetic" | "none";
  summarySource?:
    | "ollama-transcript"
    | "ollama-description-fallback"
    | "ollama-synthetic-fallback"
    | "unavailable";
  segmentSource?: "transcript-chunks" | "description-fallback" | "synthetic-fallback" | "unavailable";
  captionLanguage?: string;
  captionKind?: "manual" | "asr";
  captionSource?: "watch-page-captions" | "timedtext" | "youtube-transcript-package";
  mapsProvenance?: "google-geocoding" | "catalog-fallback" | "mixed";
  geocodeWarnings?: string[];
  summaryUnavailable?: boolean;
  unavailableReason?: string;
};

interface VideoState {
  videos: VideoRecommendation[];
  selectedVideo: VideoRecommendation | null;
  searchQuery: string;
  recommendationSource: "youtube-data-api" | "mock-fallback" | null;
  summaryDiagnostics: SummaryDiagnostics | null;
  isSearching: boolean;
  isSummarizing: boolean;
  errorMessage: string | null;
  setVideos: (videos: VideoRecommendation[]) => void;
  upsertVideo: (video: VideoRecommendation) => void;
  setSelectedVideo: (video: VideoRecommendation | null) => void;
  setSearchQuery: (query: string) => void;
  setRecommendationSource: (source: "youtube-data-api" | "mock-fallback" | null) => void;
  setSummaryDiagnostics: (value: SummaryDiagnostics | null) => void;
  setIsSearching: (searching: boolean) => void;
  setIsSummarizing: (summarizing: boolean) => void;
  setErrorMessage: (message: string | null) => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  videos: [],
  selectedVideo: null,
  searchQuery: "",
  recommendationSource: null,
  summaryDiagnostics: null,
  isSearching: false,
  isSummarizing: false,
  errorMessage: null,
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
  setIsSearching: (isSearching) => set({ isSearching }),
  setIsSummarizing: (isSummarizing) => set({ isSummarizing }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
}));
