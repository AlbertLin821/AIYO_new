import type { AssistantAction, PersonalizedAIContext } from "@/types";
import { dayNumberFromDayId } from "@/lib/assistantActions/converters";

export type AssistantActionValidationResult = {
  validActions: AssistantAction[];
  rejectedActions: Array<{
    action: unknown;
    reason: string;
  }>;
  warnings: string[];
};

const MAX_ACTIONS = 6;
const MAX_REPLACE_DAY_ITEMS = 12;
const DANGEROUS_TEXT = /<\s*script|<\/|javascript:|onerror\s*=|onload\s*=|drop\s+table|delete\s+from|insert\s+into|update\s+\w+\s+set/i;

function reject(action: unknown, reason: string) {
  return { action, reason };
}

function hasDangerousText(value: unknown): boolean {
  if (typeof value === "string") {
    return DANGEROUS_TEXT.test(value);
  }
  if (Array.isArray(value)) {
    return value.some(hasDangerousText);
  }
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some(hasDangerousText);
  }
  return false;
}

function getTripId(action: AssistantAction): string | undefined {
  return "tripId" in action.payload ? action.payload.tripId : undefined;
}

function findDay(context: PersonalizedAIContext, dayId: string) {
  const dayNumber = dayNumberFromDayId(dayId);
  if (!dayNumber || !context.currentTrip) {
    return null;
  }
  return context.currentTrip.days.find((day) => day.dayNumber === dayNumber) || null;
}

function isKnownAction(value: unknown): value is AssistantAction {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && [
    "itinerary.add_item",
    "itinerary.update_item",
    "itinerary.remove_item",
    "itinerary.reorder_items",
    "itinerary.replace_day",
    "trip.update_metadata",
    "map.focus_location",
  ].includes(type);
}

export function validateAssistantActions(input: {
  userId: string;
  tripId?: string | null;
  actions: unknown[];
  structuredContext?: PersonalizedAIContext | null;
}): AssistantActionValidationResult {
  const validActions: AssistantAction[] = [];
  const rejectedActions: AssistantActionValidationResult["rejectedActions"] = [];
  const warnings: string[] = [];
  const context = input.structuredContext;
  const ownedTripId = context?.currentTrip?.id;

  if (context && context.userId !== input.userId) {
    return {
      validActions: [],
      rejectedActions: input.actions.map((action) => reject(action, "structuredContext userId does not match current user")),
      warnings: ["structuredContext user mismatch"],
    };
  }

  for (const action of input.actions.slice(0, MAX_ACTIONS)) {
    if (!isKnownAction(action)) {
      rejectedActions.push(reject(action, "unknown action type"));
      continue;
    }
    if (hasDangerousText(action)) {
      rejectedActions.push(reject(action, "dangerous text rejected"));
      continue;
    }

    const actionTripId = getTripId(action) || input.tripId || ownedTripId;
    if (action.type !== "map.focus_location") {
      if (!context?.currentTrip || !ownedTripId) {
        rejectedActions.push(reject(action, "missing owned current trip context"));
        continue;
      }
      if (actionTripId && actionTripId !== ownedTripId) {
        rejectedActions.push(reject(action, "trip does not belong to current user"));
        continue;
      }
    }

    if (action.type === "trip.update_metadata") {
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    if (action.type === "map.focus_location") {
      validActions.push(action);
      continue;
    }

    const day = findDay(context!, action.payload.dayId);
    if (!day) {
      rejectedActions.push(reject(action, "dayId does not exist in current trip"));
      continue;
    }

    if (action.type === "itinerary.add_item") {
      if (!action.payload.item.title.trim()) {
        rejectedActions.push(reject(action, "add_item title is required"));
        continue;
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    if (action.type === "itinerary.replace_day") {
      if (!action.payload.items.length) {
        rejectedActions.push(reject(action, "replace_day items cannot be empty"));
        continue;
      }
      if (action.payload.items.length > MAX_REPLACE_DAY_ITEMS) {
        rejectedActions.push(reject(action, "replace_day has too many items"));
        continue;
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    if (action.type === "itinerary.reorder_items") {
      const currentIds = day.items.map((item) => item.id).sort();
      const nextIds = [...action.payload.orderedItemIds].sort();
      if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
        rejectedActions.push(reject(action, "orderedItemIds must match day item ids exactly"));
        continue;
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    const itemExists = day.items.some((item) => item.id === action.payload.itemId);
    if (!itemExists) {
      rejectedActions.push(reject(action, "itemId does not exist in target day"));
      continue;
    }

    if (action.type === "itinerary.update_item" && !Object.keys(action.payload.patch).length) {
      rejectedActions.push(reject(action, "update_item patch cannot be empty"));
      continue;
    }

    validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } } as AssistantAction);
  }

  if (input.actions.length > MAX_ACTIONS) {
    warnings.push(`Only the first ${MAX_ACTIONS} assistant actions were validated.`);
  }

  return { validActions, rejectedActions, warnings };
}
