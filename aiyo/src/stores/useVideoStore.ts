import { create } from 'zustand';
import type { Video } from '@/lib/types';
import { mockVideos } from '@/lib/mock-data';

interface VideoState {
  videos: Video[];
  selectedVideo: Video | null;
  searchQuery: string;
  isSearching: boolean;
  isAnalyzing: boolean;
  setVideos: (videos: Video[]) => void;
  setSelectedVideo: (video: Video | null) => void;
  setSearchQuery: (query: string) => void;
  setIsSearching: (searching: boolean) => void;
  setIsAnalyzing: (analyzing: boolean) => void;
}

export const useVideoStore = create<VideoState>((set) => ({
  videos: mockVideos,
  selectedVideo: null,
  searchQuery: '',
  isSearching: false,
  isAnalyzing: false,
  setVideos: (videos) => set({ videos }),
  setSelectedVideo: (video) => set({ selectedVideo: video }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setIsSearching: (searching) => set({ isSearching: searching }),
  setIsAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),
}));
