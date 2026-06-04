import { create } from "zustand";
import type { SyncMutationSource } from "@/stores/syncMutationSource";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import type { MapPin } from "@/types";

export type PendingMapPoi = {
  placeId?: string;
  lat: number;
  lng: number;
};

export type MapFocusLocation = {
  placeName: string;
  lat?: number | null;
  lng?: number | null;
  zoom?: number;
} | null;

interface MapState {
  pins: MapPin[];
  selectedPinId: string | null;
  pendingPoi: PendingMapPoi | null;
  focusLocation: MapFocusLocation;
  preferredPoiDay: number;
  panelOpen: boolean;
  /** 空陣列代表顯示全部天數路線；有值時僅顯示指定天數。 */
  visibleRouteDayNumbers: number[];
  lastSyncedAt: string | null;
  /** 行程路段 id（見 routeSegments）對應 Google Directions 換算後的分鐘數；缺鍵時 UI 退回直線估算。 */
  segmentDirectionsMinutes: Record<string, number>;
  setPins: (pins: MapPin[], source?: SyncMutationSource) => void;
  addPins: (pins: MapPin[]) => void;
  removePin: (id: string) => void;
  setSelectedPinId: (id: string | null) => void;
  setPendingPoi: (poi: PendingMapPoi | null) => void;
  setFocusLocation: (focus: MapFocusLocation) => void;
  setPreferredPoiDay: (dayNumber: number) => void;
  setPanelOpen: (open: boolean) => void;
  setVisibleRouteDayNumbers: (dayNumbers: number[]) => void;
  toggleVisibleRouteDayNumber: (dayNumber: number) => void;
  clearVisibleRouteDayNumbers: () => void;
  clearPins: () => void;
  setItinerarySegmentDurations: (minutesBySegmentId: Record<string, number>) => void;
}

function normalizeVisibleRouteDayNumbers(dayNumbers: number[]): number[] {
  return [...new Set(dayNumbers.filter((day) => Number.isInteger(day) && day > 0))].sort(
    (left, right) => left - right,
  );
}

export const useMapStore = create<MapState>((set) => ({
  pins: [],
  selectedPinId: null,
  pendingPoi: null,
  focusLocation: null,
  preferredPoiDay: 1,
  panelOpen: true,
  visibleRouteDayNumbers: [],
  lastSyncedAt: null,
  segmentDirectionsMinutes: {},
  setPins: (pins, source: SyncMutationSource = "local-user-edit") =>
    withSyncMutationSource(source, () =>
      set((state) => ({
        pins: pins.filter((pin) => hasUsableMapCoordinate(pin)),
        selectedPinId: pins.some((pin) => pin.id === state.selectedPinId && hasUsableMapCoordinate(pin))
          ? state.selectedPinId
          : (pins.find((pin) => hasUsableMapCoordinate(pin))?.id ?? null),
        lastSyncedAt: new Date().toISOString(),
      })),
    ),
  addPins: (incomingPins) =>
    withSyncMutationSource("local-user-edit", () =>
      set((state) => {
        const existingNames = new Set(state.pins.map((pin) => pin.name));
        const pins = [
          ...state.pins,
          ...incomingPins.filter((pin) => hasUsableMapCoordinate(pin) && !existingNames.has(pin.name)),
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
  setPendingPoi: (pendingPoi) => set({ pendingPoi }),
  setFocusLocation: (focusLocation) => set({ focusLocation }),
  setPreferredPoiDay: (preferredPoiDay) => set({ preferredPoiDay }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setVisibleRouteDayNumbers: (visibleRouteDayNumbers) =>
    set({ visibleRouteDayNumbers: normalizeVisibleRouteDayNumbers(visibleRouteDayNumbers) }),
  toggleVisibleRouteDayNumber: (dayNumber) =>
    set((state) => {
      if (!Number.isInteger(dayNumber) || dayNumber <= 0) {
        return {};
      }
      const current = normalizeVisibleRouteDayNumbers(state.visibleRouteDayNumbers);
      const next = current.includes(dayNumber)
        ? current.filter((day) => day !== dayNumber)
        : [...current, dayNumber];
      return { visibleRouteDayNumbers: normalizeVisibleRouteDayNumbers(next) };
    }),
  clearVisibleRouteDayNumbers: () => set({ visibleRouteDayNumbers: [] }),
  clearPins: () =>
    withSyncMutationSource("bootstrap", () =>
      set({
        pins: [],
        selectedPinId: null,
        pendingPoi: null,
        focusLocation: null,
        visibleRouteDayNumbers: [],
        lastSyncedAt: null,
        segmentDirectionsMinutes: {},
      }),
    ),
  setItinerarySegmentDurations: (minutesBySegmentId) => set({ segmentDirectionsMinutes: { ...minutesBySegmentId } }),
}));
