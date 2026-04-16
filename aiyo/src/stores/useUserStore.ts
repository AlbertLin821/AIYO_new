import { create } from "zustand";
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
  travelDays: 1,
  preferredTransport: "",
  travelPace: "moderate",
  interests: [],
  isFirstVisit: true,
  updateProfile: (updates) => set((state) => ({ ...state, ...updates })),
  setFirstVisit: (isFirstVisit) => set({ isFirstVisit }),
}));
