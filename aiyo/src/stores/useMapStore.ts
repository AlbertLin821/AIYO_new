import { create } from "zustand";
import type { MapPin } from "@/types";

interface MapState {
  pins: MapPin[];
  selectedPinId: string | null;
  panelOpen: boolean;
  lastSyncedAt: string | null;
  setPins: (pins: MapPin[]) => void;
  addPins: (pins: MapPin[]) => void;
  removePin: (id: string) => void;
  setSelectedPinId: (id: string | null) => void;
  setPanelOpen: (open: boolean) => void;
  clearPins: () => void;
}

export const useMapStore = create<MapState>((set) => ({
  pins: [],
  selectedPinId: null,
  panelOpen: true,
  lastSyncedAt: null,
  setPins: (pins) =>
    set((state) => ({
      pins,
      selectedPinId: pins.some((pin) => pin.id === state.selectedPinId)
        ? state.selectedPinId
        : (pins[0]?.id ?? null),
      lastSyncedAt: new Date().toISOString(),
    })),
  addPins: (incomingPins) =>
    set((state) => {
      const existingNames = new Set(state.pins.map((pin) => pin.name));
      const pins = [
        ...state.pins,
        ...incomingPins.filter((pin) => !existingNames.has(pin.name)),
      ];
      return {
        pins,
        selectedPinId: state.selectedPinId ?? pins[0]?.id ?? null,
        lastSyncedAt: new Date().toISOString(),
      };
    }),
  removePin: (id) =>
    set((state) => {
      const pins = state.pins.filter((pin) => pin.id !== id);
      return {
        pins,
        selectedPinId:
          state.selectedPinId === id ? (pins[0]?.id ?? null) : state.selectedPinId,
      };
    }),
  setSelectedPinId: (selectedPinId) => set({ selectedPinId }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  clearPins: () => set({ pins: [], selectedPinId: null, lastSyncedAt: null }),
}));
