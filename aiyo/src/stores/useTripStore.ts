import { create } from "zustand";
import type { PersistedTripPayload, TripPlanDay, TripPlanItem, TripPlanResult } from "@/types";

interface TripState {
  tripId: string | null;
  title: string;
  destination: string;
  days: number;
  budget: number;
  itinerary: TripPlanDay[];
  planSummary: string;
  lastUpdatedAt: string | null;
  setDestination: (destination: string) => void;
  setDays: (days: number) => void;
  setBudget: (budget: number) => void;
  setItinerary: (itinerary: TripPlanDay[]) => void;
  setRemoteTrip: (trip: PersistedTripPayload, budget?: number) => void;
  replaceTripPlan: (
    plan: TripPlanResult,
    details?: Partial<Pick<TripState, "destination" | "days" | "budget" | "title">>,
  ) => void;
  addItineraryItem: (dayNumber: number, item: TripPlanItem) => void;
  removeItineraryItem: (dayNumber: number, itemId: string) => void;
  addDay: () => void;
  removeDay: (dayNumber: number) => void;
  reorderItineraryItem: (dayNumber: number, oldIndex: number, newIndex: number) => void;
}

export const useTripStore = create<TripState>((set) => ({
  tripId: null,
  title: "",
  destination: "",
  days: 1,
  budget: 0,
  itinerary: [],
  planSummary: "",
  lastUpdatedAt: null,
  setDestination: (destination) => set({ destination }),
  setDays: (days) => set({ days: Math.max(1, days) }),
  setBudget: (budget) => set({ budget: Math.max(0, budget) }),
  setItinerary: (itinerary) =>
    set({
      itinerary,
      days: Math.max(1, itinerary.length),
      lastUpdatedAt: new Date().toISOString(),
    }),
  setRemoteTrip: (trip, budget) =>
    set({
      tripId: trip.tripId,
      title: trip.title,
      destination: trip.destination,
      days: trip.days,
      budget: budget ?? 0,
      itinerary: trip.itinerary,
      lastUpdatedAt: trip.updatedAt,
    }),
  replaceTripPlan: (plan, details) =>
    set((state) => ({
      itinerary: plan.days,
      days: details?.days ?? plan.days.length,
      title: details?.title ?? state.title,
      planSummary: plan.summary,
      destination: details?.destination ?? state.destination,
      budget: details?.budget ?? state.budget,
      lastUpdatedAt: new Date().toISOString(),
    })),
  addItineraryItem: (dayNumber, item) =>
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
    })),
  removeItineraryItem: (dayNumber, itemId) =>
    set((state) => ({
      itinerary: state.itinerary.map((day) =>
        day.dayNumber === dayNumber
          ? { ...day, items: day.items.filter((item) => item.id !== itemId) }
          : day,
      ),
      lastUpdatedAt: new Date().toISOString(),
    })),
  addDay: () =>
    set((state) => {
      const nextDay = state.itinerary.length + 1;
      return {
        itinerary: [
          ...state.itinerary,
          {
            dayNumber: nextDay,
            theme: `第 ${nextDay} 天`,
            summary: "從這裡開始安排當日行程。",
            items: [],
          },
        ],
        days: nextDay,
        lastUpdatedAt: new Date().toISOString(),
      };
    }),
  removeDay: (dayNumber) =>
    set((state) => {
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
    }),
  reorderItineraryItem: (dayNumber, oldIndex, newIndex) =>
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
    })),
}));
