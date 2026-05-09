import { zhTW as t } from "@/locales/zh-TW";
import type { TripPlanItem } from "@/types";

export const activityTypeColors: Record<TripPlanItem["type"], string> = {
  attraction: "border-l-primary",
  restaurant: "border-l-secondary",
  shopping: "border-l-peach",
  activity: "border-l-lavender",
  transport: "border-l-tertiary",
  hotel: "border-l-muted",
};

export const activityTypeOptions: Array<{ value: TripPlanItem["type"]; label: string }> = [
  { value: "attraction", label: t.itineraryPanel.typeAttraction },
  { value: "restaurant", label: t.itineraryPanel.typeRestaurant },
  { value: "shopping", label: t.itineraryPanel.typeShopping },
  { value: "activity", label: t.itineraryPanel.typeActivity },
  { value: "transport", label: t.itineraryPanel.typeTransport },
  { value: "hotel", label: t.itineraryPanel.typeHotel },
];

export function activityTypeLabel(itemType: TripPlanItem["type"]) {
  const option = activityTypeOptions.find((item) => item.value === itemType);
  return option?.label ?? itemType;
}

export function presenceActionLabel(activeSection: string) {
  if (activeSection === "itinerary-editor" || activeSection === "itinerary") {
    return t.collab.presenceActionEditingItinerary;
  }
  return t.collab.presenceActionOther;
}

export function roleLabel(role: "owner" | "editor" | "viewer") {
  if (role === "owner") {
    return t.itineraryPage.roleOwner;
  }
  if (role === "editor") {
    return t.itineraryPage.roleEditor;
  }
  return t.itineraryPage.roleViewer;
}
