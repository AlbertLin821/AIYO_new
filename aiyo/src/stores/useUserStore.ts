import { create } from 'zustand';
import type { User } from '@/lib/types';
import { mockUser } from '@/lib/mock-data';

interface UserState extends User {
  isFirstVisit: boolean;
  updateProfile: (updates: Partial<User>) => void;
  setFirstVisit: (first: boolean) => void;
}

export const useUserStore = create<UserState>((set) => ({
  ...mockUser,
  isFirstVisit: true,
  updateProfile: (updates) => set((s) => ({ ...s, ...updates })),
  setFirstVisit: (first) => set({ isFirstVisit: first }),
}));
