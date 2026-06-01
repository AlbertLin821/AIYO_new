import type { SourceReference } from "./sources";

export type Trip = {
  id: string;
  title: string;
  destination: string;
  origin?: string;
  startDate?: string;
  endDate?: string;
  days: ItineraryDay[];
  preferences?: TravelPreferences;
  sources?: SourceReference[];
  createdAt: string;
  updatedAt: string;
};

export type TravelPreferences = {
  durationDays?: number;
  budgetLevel?: "low" | "medium" | "high" | "luxury";
  pace?: "relaxed" | "balanced" | "packed";
  companions?: Array<"solo" | "couple" | "friends" | "family" | "elderly" | "children">;
  interests?: string[];
  avoidances?: string[];
  visitedBefore?: string[];
  language?: "zh-TW" | "en" | "ja" | "mixed";
};

export type ItineraryDay = {
  id: string;
  dayIndex: number;
  title: string;
  date?: string;
  summary?: string;
  items: ItineraryItem[];
};

export type ItineraryItem = {
  id: string;
  dayId: string;
  orderIndex: number;
  startTime?: string;
  endTime?: string;
  title: string;
  description?: string;
  itemType: "place" | "meal" | "transport" | "activity" | "hotel" | "free_time";
  place?: TravelPlace;
  estimatedCost?: number;
  durationMinutes?: number;
  sourceIds?: string[];
  notes?: string;
};

export type TravelPlace = {
  id: string;
  name: string;
  address?: string;
  lat?: number;
  lng?: number;
  googlePlaceId?: string;
  rating?: number;
  imageUrl?: string;
  tags?: string[];
};

export type ItineraryPatch = {
  operation:
    | "create_trip"
    | "update_trip"
    | "add_item"
    | "remove_item"
    | "move_item"
    | "replace_item"
    | "update_item"
    | "reorder_day";
  tripId?: string;
  dayId?: string;
  itemId?: string;
  payload: Record<string, unknown>;
};
