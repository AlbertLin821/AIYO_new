import { create } from 'zustand';

interface UIState {
  sidebarCollapsed: boolean;
  showOnboarding: boolean;
  voiceState: 'idle' | 'listening' | 'processing' | 'speaking';
  chatBubbleOpen: boolean;
  activeVideoDrawer: string | null;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setShowOnboarding: (show: boolean) => void;
  setVoiceState: (state: UIState['voiceState']) => void;
  setChatBubbleOpen: (open: boolean) => void;
  setActiveVideoDrawer: (videoId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  showOnboarding: true,
  voiceState: 'idle',
  chatBubbleOpen: false,
  activeVideoDrawer: null,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setChatBubbleOpen: (open) => set({ chatBubbleOpen: open }),
  setActiveVideoDrawer: (videoId) => set({ activeVideoDrawer: videoId }),
}));
