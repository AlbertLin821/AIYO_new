import { create } from "zustand";
import type { SyncMutationSource } from "@/stores/syncMutationSource";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import type { PersistedTripPayload, TripPlanDay, TripPlanItem, TripPlanResult } from "@/types";

export const EMPTY_TRIP_STATE = {
  tripId: null,
  title: "",
  destination: "",
  days: 1,
  budget: 0,
  coverImageUrl: null as string | null,
  itinerary: [] as TripPlanDay[],
  planSummary: "",
  lastUpdatedAt: null as string | null,
};

interface TripState {
  tripId: string | null;
  title: string;
  destination: string;
  days: number;
  budget: number;
  coverImageUrl: string | null;
  itinerary: TripPlanDay[];
  planSummary: string;
  lastUpdatedAt: string | null;
  setDestination: (destination: string) => void;
  setDays: (days: number) => void;
  setBudget: (budget: number) => void;
  setCoverImageUrl: (url: string | null) => void;
  setItinerary: (itinerary: TripPlanDay[]) => void;
  setRemoteTrip: (trip: PersistedTripPayload, budget?: number, source?: SyncMutationSource) => void;
  replaceTripPlan: (
    plan: TripPlanResult,
    details?: Partial<Pick<TripState, "destination" | "days" | "budget" | "title">>,
  ) => void;
  addItineraryItem: (dayNumber: number, item: TripPlanItem) => void;
  updateItineraryItem: (dayNumber: number, itemId: string, patch: Partial<TripPlanItem>) => void;
  updateItineraryItemTransport: (dayNumber: number, itemId: string, transport: string) => void;
  removeItineraryItem: (dayNumber: number, itemId: string) => void;
  addDay: () => void;
  insertDayAfter: (afterDayNumber: number) => void;
  removeDay: (dayNumber: number) => void;
  reorderItineraryItem: (dayNumber: number, oldIndex: number, newIndex: number) => void;
  resetTrip: (source?: SyncMutationSource) => void;
}

export const useTripStore = create<TripState>((set) => ({
  ...EMPTY_TRIP_STATE,
  setDestination: (destination) =>
    withSyncMutationSource("local-user-edit", () => {
      set({ destination });
    }),
  setDays: (days) =>
    withSyncMutationSource("local-user-edit", () => {
      set({ days: Math.max(1, days) });
    }),
  setBudget: (budget) =>
    withSyncMutationSource("local-user-edit", () => {
      set({ budget: Math.max(0, budget) });
    }),
  setCoverImageUrl: (url) =>
    withSyncMutationSource("local-user-edit", () => {
      set({ coverImageUrl: url, lastUpdatedAt: new Date().toISOString() });
    }),
  setItinerary: (itinerary) =>
    withSyncMutationSource("local-user-edit", () => {
      set({
        itinerary,
        days: Math.max(1, itinerary.length),
        lastUpdatedAt: new Date().toISOString(),
      });
    }),
  setRemoteTrip: (trip, budget, source = "server-ack") =>
    withSyncMutationSource(source, () => {
      set({
        tripId: trip.tripId,
        title: trip.title,
        destination: trip.destination,
        days: Math.max(1, trip.days || trip.itinerary.length || 1),
        budget: budget ?? 0,
        coverImageUrl:
          typeof trip.coverImageUrl === "string" && trip.coverImageUrl.trim().length > 0
            ? trip.coverImageUrl.trim()
            : null,
        itinerary: trip.itinerary,
        planSummary: "",
        lastUpdatedAt: trip.updatedAt,
      });
    }),
  replaceTripPlan: (plan, details) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        itinerary: plan.days,
        days: details?.days ?? plan.days.length,
        title: details?.title ?? state.title,
        planSummary: plan.summary,
        destination: details?.destination ?? state.destination,
        budget: details?.budget ?? state.budget,
        coverImageUrl: state.coverImageUrl,
        lastUpdatedAt: new Date().toISOString(),
      }));
    }),
  addItineraryItem: (dayNumber, item) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        itinerary: state.itinerary.map((day) =>
          day.dayNumber === dayNumber
            ? {
                ...day,
                items: [...day.items, { ...item, dayNumber }],
              }
            : day,
        ),
        lastUpdatedAt: new Date().toISOString(),
      }));
    }),
  updateItineraryItem: (dayNumber, itemId, patch) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        itinerary: state.itinerary.map((day) =>
          day.dayNumber === dayNumber
            ? {
                ...day,
                items: day.items.map((item) =>
                  item.id === itemId ? { ...item, ...patch, id: item.id } : item,
                ),
              }
            : day,
        ),
        lastUpdatedAt: new Date().toISOString(),
      }));
    }),
  updateItineraryItemTransport: (dayNumber, itemId, transport) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        itinerary: state.itinerary.map((day) =>
          day.dayNumber === dayNumber
            ? {
                ...day,
                items: day.items.map((item) =>
                  item.id === itemId ? { ...item, transport } : item,
                ),
              }
            : day,
        ),
        lastUpdatedAt: new Date().toISOString(),
      }));
    }),
  removeItineraryItem: (dayNumber, itemId) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        itinerary: state.itinerary.map((day) =>
          day.dayNumber === dayNumber
            ? { ...day, items: day.items.filter((item) => item.id !== itemId) }
            : day,
        ),
        lastUpdatedAt: new Date().toISOString(),
      }));
    }),
  addDay: () =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        const nextDay = state.itinerary.length + 1;
        return {
          itinerary: [
            ...state.itinerary,
            {
              dayNumber: nextDay,
              theme: `Day ${nextDay}`,
              summary: "尚未安排內容",
              items: [],
            },
          ],
          days: nextDay,
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    }),
  insertDayAfter: (afterDayNumber) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        const idx = state.itinerary.findIndex((d) => d.dayNumber === afterDayNumber);
        if (idx === -1) {
          return state;
        }
        const insertAt = idx + 1;
        const merged = [
          ...state.itinerary.slice(0, insertAt),
          {
            dayNumber: 0,
            theme: "",
            summary: "尚未安排內容",
            items: [] as TripPlanItem[],
          },
          ...state.itinerary.slice(insertAt),
        ];
        const renumbered = merged.map((day, index) => ({
          ...day,
          dayNumber: index + 1,
          theme: day.theme?.trim() ? day.theme : `Day ${index + 1}`,
          items: day.items.map((item) => ({ ...item, dayNumber: index + 1 })),
        }));
        return {
          itinerary: renumbered,
          days: renumbered.length,
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    }),
  removeDay: (dayNumber) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        if (state.itinerary.length <= 1) {
          return state;
        }
        const itinerary = state.itinerary
          .filter((day) => day.dayNumber !== dayNumber)
          .map((day, index) => ({
            ...day,
            dayNumber: index + 1,
            items: day.items.map((item) => ({ ...item, dayNumber: index + 1 })),
          }));
        return {
          itinerary,
          days: Math.max(1, itinerary.length),
          lastUpdatedAt: new Date().toISOString(),
        };
      });
    }),
  reorderItineraryItem: (dayNumber, oldIndex, newIndex) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        itinerary: state.itinerary.map((day) => {
          if (day.dayNumber !== dayNumber) {
            return day;
          }
          const items = [...day.items];
          const [moved] = items.splice(oldIndex, 1);
          items.splice(newIndex, 0, moved);
          return { ...day, items };
        }),
        lastUpdatedAt: new Date().toISOString(),
      }));
    }),
  resetTrip: (source = "bootstrap") =>
    withSyncMutationSource(source, () => {
      set(EMPTY_TRIP_STATE);
    }),
}));
