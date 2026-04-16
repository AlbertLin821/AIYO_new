import { create } from 'zustand';
import type { ExtractedLocation } from '@/lib/types';
import { mockItinerary } from '@/lib/mock-data';

export interface MapPin extends ExtractedLocation {
  id: string;
  color?: string;
}

interface MapState {
  pins: MapPin[];
  selectedPin: MapPin | null;
  panelOpen: boolean;
  addPins: (locations: ExtractedLocation[]) => void;
  removePin: (id: string) => void;
  setSelectedPin: (pin: MapPin | null) => void;
  setPanelOpen: (open: boolean) => void;
  clearPins: () => void;
}

const colors = ['#F4A7B9', '#7C9CBF', '#B8D8BA', '#C3B1E1', '#FFDAB9', '#FFB347', '#87CEEB'];

// Seed initial pins from mock itinerary (deduplicated by name)
const initialPins: MapPin[] = [];
const seen = new Set<string>();
mockItinerary.forEach((day) => {
  day.items.forEach((item) => {
    if (item.location && !seen.has(item.location.name)) {
      seen.add(item.location.name);
      initialPins.push({
        ...item.location,
        id: `pin_init_${initialPins.length}`,
        color: colors[initialPins.length % colors.length],
      });
    }
  });
});

export const useMapStore = create<MapState>((set) => ({
  pins: initialPins,
  selectedPin: null,
  panelOpen: true,
  addPins: (locations) =>
    set((s) => {
      const existingNames = new Set(s.pins.map((p) => p.name));
      const newPins: MapPin[] = locations
        .filter((loc) => !existingNames.has(loc.name))
        .map((loc, i) => ({
          ...loc,
          id: `pin_${Date.now()}_${i}`,
          color: colors[(s.pins.length + i) % colors.length],
        }));
      return { pins: [...s.pins, ...newPins] };
    }),
  removePin: (id) =>
    set((s) => ({ pins: s.pins.filter((p) => p.id !== id) })),
  setSelectedPin: (pin) => set({ selectedPin: pin }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  clearPins: () => set({ pins: [], selectedPin: null }),
}));
