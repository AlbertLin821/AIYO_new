import { create } from "zustand";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import type { User } from "@/types";

interface UserState extends User {
  isFirstVisit: boolean;
  updateProfile: (updates: Partial<User>) => void;
  setFirstVisit: (first: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
  name: "",
  email: "",
  travelPreferences: [],
  budget: 0,
  destination: "",
  travelDays: 0,
  preferredTransport: "",
  travelPace: "",
  interests: [],
  interestIcons: {},
  isFirstVisit: true,
  updateProfile: (updates) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({ ...state, ...updates }));
    }),
  setFirstVisit: (isFirstVisit) => set({ isFirstVisit }),
}));
