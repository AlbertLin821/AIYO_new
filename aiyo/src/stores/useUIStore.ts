import { create } from 'zustand';

interface UIState {
  showOnboarding: boolean;
  voiceState: 'idle' | 'listening' | 'processing' | 'speaking';
  chatBubbleOpen: boolean;
  activeVideoDrawer: string | null;
  loginModalOpen: boolean;
  loginModalCallbackUrl: string | null;
  sidebarCollapsed: boolean;
  settingsModalOpen: boolean;
  setShowOnboarding: (show: boolean) => void;
  setVoiceState: (state: UIState['voiceState']) => void;
  setChatBubbleOpen: (open: boolean) => void;
  setActiveVideoDrawer: (videoId: string | null) => void;
  setLoginModalOpen: (open: boolean, callbackUrl?: string | null) => void;
  toggleSidebar: () => void;
  setSettingsModalOpen: (open: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  showOnboarding: false,
  voiceState: 'idle',
  chatBubbleOpen: false,
  activeVideoDrawer: null,
  loginModalOpen: false,
  loginModalCallbackUrl: null,
  sidebarCollapsed: false,
  settingsModalOpen: false,
  setShowOnboarding: (show) => set({ showOnboarding: show }),
  setVoiceState: (voiceState) => set({ voiceState }),
  setChatBubbleOpen: (open) => set({ chatBubbleOpen: open }),
  setActiveVideoDrawer: (videoId) => set({ activeVideoDrawer: videoId }),
  setLoginModalOpen: (open, callbackUrl) =>
    set({ loginModalOpen: open, loginModalCallbackUrl: open ? (callbackUrl ?? null) : null }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSettingsModalOpen: (open) => set({ settingsModalOpen: open }),
}));
