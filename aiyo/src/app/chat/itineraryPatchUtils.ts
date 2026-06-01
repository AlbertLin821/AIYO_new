import { useTripStore } from "@/stores/useTripStore";
import type { AddItineraryChange, AiProposedChange, ExistingItemChange, TripPlanItem } from "@/types";

export function buildItineraryItemFromAiChange(change: AddItineraryChange): TripPlanItem {
  const title = change.title.trim() || change.locationName?.trim() || "AI 建議行程";
  return {
    id: `ai_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dayNumber: change.day,
    time: change.time,
    title,
    type: /夜市|飯|餐|小吃|美食|魚頭/.test(title) ? "restaurant" : "attraction",
    transport: change.transport?.trim() || undefined,
    notes: [change.locationName ? `地點：${change.locationName}` : "", change.notes || ""].filter(Boolean).join("\n") || undefined,
    source: "ai",
    location: undefined,
  };
}

function compactItineraryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

export function findItineraryItemTarget(change: ExistingItemChange) {
  const itinerary = useTripStore.getState().itinerary;
  const scopedDays = change.day
    ? itinerary.filter((day) => day.dayNumber === change.day)
    : itinerary;
  if (change.itemId) {
    for (const day of scopedDays) {
      const item = day.items.find((candidate) => candidate.id === change.itemId);
      if (item) {
        return { dayNumber: day.dayNumber, item };
      }
    }
  }
  const targetTitle = compactItineraryText(change.targetTitle || "");
  if (!targetTitle) {
    return null;
  }
  for (const day of scopedDays) {
    const item = day.items.find((candidate) => {
      const title = compactItineraryText(candidate.title);
      const location = compactItineraryText(candidate.location?.name || "");
      return (
        title.includes(targetTitle) ||
        targetTitle.includes(title) ||
        Boolean(location && (location.includes(targetTitle) || targetTitle.includes(location)))
      );
    });
    if (item) {
      return { dayNumber: day.dayNumber, item };
    }
  }
  return null;
}

export type { AiProposedChange };
