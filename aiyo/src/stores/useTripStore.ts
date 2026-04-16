import { create } from 'zustand';
import type { ItineraryDay, ItineraryItem } from '@/lib/types';
import { mockItinerary } from '@/lib/mock-data';

interface TripState {
  destination: string;
  days: number;
  budget: number;
  itinerary: ItineraryDay[];
  setDestination: (dest: string) => void;
  setDays: (days: number) => void;
  setBudget: (budget: number) => void;
  setItinerary: (itinerary: ItineraryDay[]) => void;
  addItineraryItem: (day: number, item: ItineraryItem) => void;
  removeItineraryItem: (day: number, itemId: string) => void;
  addDay: () => void;
  removeDay: (day: number) => void;
  reorderItineraryItem: (day: number, oldIndex: number, newIndex: number) => void;
}

export const useTripStore = create<TripState>((set) => ({
  destination: '東京',
  days: 5,
  budget: 50000,
  itinerary: mockItinerary,
  setDestination: (destination) => set({ destination }),
  setDays: (days) => set({ days }),
  setBudget: (budget) => set({ budget }),
  setItinerary: (itinerary) => set({ itinerary }),
  addItineraryItem: (day, item) =>
    set((s) => ({
      itinerary: s.itinerary.map((d) =>
        d.day === day ? { ...d, items: [...d.items, item] } : d
      ),
    })),
  removeItineraryItem: (day, itemId) =>
    set((s) => ({
      itinerary: s.itinerary.map((d) =>
        d.day === day ? { ...d, items: d.items.filter((i) => i.id !== itemId) } : d
      ),
    })),
  addDay: () =>
    set((s) => {
      const newDay = s.itinerary.length + 1;
      return { itinerary: [...s.itinerary, { day: newDay, items: [] }], days: newDay };
    }),
  removeDay: (day) =>
    set((s) => ({
      itinerary: s.itinerary
        .filter((d) => d.day !== day)
        .map((d, i) => ({ ...d, day: i + 1 })),
      days: s.itinerary.length - 1,
    })),
  reorderItineraryItem: (day, oldIndex, newIndex) =>
    set((s) => ({
      itinerary: s.itinerary.map((d) => {
        if (d.day !== day) return d;
        const newItems = [...d.items];
        const [movedItem] = newItems.splice(oldIndex, 1);
        newItems.splice(newIndex, 0, movedItem);
        return { ...d, items: newItems };
      }),
    })),
}));
