import { create } from 'zustand';

interface UIState {
  showOnboarding: boolean;
  voiceState: 'idle' | 'listening' | 'processing' | 'speaking';
  chatBubbleOpen: boolean;
  activeVideoDrawer: string | null;
  setShowOnboarding: (show: boolean) => void;
  setVoiceState: (state: UIState['voiceState']) => void;
  setChatBubbleOpen: (open: boolean) => void;
  setActiveVideoDrawer: (videoId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showOnboarding: true,
  voiceState: 'idle',
  chatBubbleOpen: false,
  activeVideoDrawer: null,
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setChatBubbleOpen: (open) => set({ chatBubbleOpen: open }),
  setActiveVideoDrawer: (videoId) => set({ activeVideoDrawer: videoId }),
}));
