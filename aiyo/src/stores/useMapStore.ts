import { create } from "zustand";
import type { SyncMutationSource } from "@/stores/syncMutationSource";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import type { MapPin } from "@/types";

interface MapState {
  pins: MapPin[];
  selectedPinId: string | null;
  panelOpen: boolean;
  lastSyncedAt: string | null;
  setPins: (pins: MapPin[], source?: SyncMutationSource) => void;
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
  setPins: (pins, source: SyncMutationSource = "local-user-edit") =>
    withSyncMutationSource(source, () =>
      set((state) => ({
        pins,
        selectedPinId: pins.some((pin) => pin.id === state.selectedPinId)
          ? state.selectedPinId
          : (pins[0]?.id ?? null),
        lastSyncedAt: new Date().toISOString(),
      })),
    ),
  addPins: (incomingPins) =>
    withSyncMutationSource("local-user-edit", () =>
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
    ),
  removePin: (id) =>
    withSyncMutationSource("local-user-edit", () =>
      set((state) => {
        const pins = state.pins.filter((pin) => pin.id !== id);
        return {
          pins,
          selectedPinId:
            state.selectedPinId === id ? (pins[0]?.id ?? null) : state.selectedPinId,
        };
      }),
    ),
  setSelectedPinId: (selectedPinId) =>
    withSyncMutationSource("local-user-edit", () => set({ selectedPinId })),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  clearPins: () =>
    withSyncMutationSource("bootstrap", () =>
      set({ pins: [], selectedPinId: null, lastSyncedAt: null }),
    ),
}));
