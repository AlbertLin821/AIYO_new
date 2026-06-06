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
  if (!context.currentTrip) {
    return null;
  }
  const byId = context.currentTrip.days.find((day) => day.id === dayId);
  if (byId) {
    return byId;
  }
  const dayNumber = dayNumberFromDayId(dayId);
  if (!dayNumber) {
    return null;
  }
  return context.currentTrip.days.find((day) => day.dayNumber === dayNumber) || null;
}

function resolveDayForValidation(input: {
  context: PersonalizedAIContext;
  dayId: string;
  simulatedDayCount: number;
  allowVirtualEmptyDay?: boolean;
}) {
  const existing = findDay(input.context, input.dayId);
  if (existing) {
    return existing;
  }
  if (!input.allowVirtualEmptyDay) {
    return null;
  }
  const dayNumber = dayNumberFromDayId(input.dayId);
  if (!dayNumber || dayNumber < 1 || dayNumber > input.simulatedDayCount) {
    return null;
  }
  return {
    id: input.dayId,
    dayNumber,
    items: [] as Array<{ id: string; title: string }>,
  };
}

function initialSimulatedDayCount(context: PersonalizedAIContext | null | undefined): number {
  if (!context?.currentTrip?.days.length) {
    return 0;
  }
  return Math.max(
    context.currentTrip.days.length,
    ...context.currentTrip.days.map((day) => day.dayNumber),
  );
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
  const pushRejected = (action: unknown, reason: string) => {
    rejectedActions.push(reject(action, reason));
    warnings.push(reason);
  };

  if (context && context.userId !== input.userId) {
    return {
      validActions: [],
      rejectedActions: input.actions.map((action) => reject(action, "structuredContext userId does not match current user")),
      warnings: ["structuredContext userId does not match current user"],
    };
  }

  let simulatedDayCount = initialSimulatedDayCount(context);

  for (const action of input.actions.slice(0, MAX_ACTIONS)) {
    if (!isKnownAction(action)) {
      pushRejected(action, "unknown action type");
      continue;
    }
    if (hasDangerousText(action)) {
      pushRejected(action, "dangerous text rejected");
      continue;
    }

    const actionTripId = getTripId(action) || input.tripId || ownedTripId;
    if (action.type !== "map.focus_location") {
      if (!context?.currentTrip || !ownedTripId) {
        pushRejected(action, "missing owned current trip context");
        continue;
      }
      if (actionTripId && actionTripId !== ownedTripId) {
        pushRejected(action, "trip does not belong to current user");
        continue;
      }
    }

    if (action.type === "trip.update_metadata") {
      if (typeof action.payload.days === "number") {
        simulatedDayCount = Math.max(
          simulatedDayCount,
          Math.max(1, Math.min(30, Math.floor(action.payload.days))),
        );
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    if (action.type === "map.focus_location") {
      validActions.push(action);
      continue;
    }

    const day = resolveDayForValidation({
      context: context!,
      dayId: action.payload.dayId,
      simulatedDayCount,
      allowVirtualEmptyDay: action.type === "itinerary.add_item",
    });
    if (!day) {
      pushRejected(action, "dayId does not exist in current trip");
      continue;
    }

    if (action.type === "itinerary.add_item") {
      if (!action.payload.item.title.trim()) {
        pushRejected(action, "add_item title is required");
        continue;
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    if (action.type === "itinerary.replace_day") {
      if (!action.payload.items.length) {
        pushRejected(action, "replace_day items cannot be empty");
        continue;
      }
      if (action.payload.items.length > MAX_REPLACE_DAY_ITEMS) {
        pushRejected(action, "replace_day has too many items");
        continue;
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    if (action.type === "itinerary.reorder_items") {
      const currentIds = day.items.map((item) => item.id).sort();
      const nextIds = [...action.payload.orderedItemIds].sort();
      if (currentIds.length !== nextIds.length || currentIds.some((id, index) => id !== nextIds[index])) {
        pushRejected(action, "orderedItemIds must match day item ids exactly");
        continue;
      }
      validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } });
      continue;
    }

    const itemExists = day.items.some((item) => item.id === action.payload.itemId);
    if (!itemExists) {
      pushRejected(action, "itemId does not exist in target day");
      continue;
    }

    if (action.type === "itinerary.update_item" && !Object.keys(action.payload.patch).length) {
      pushRejected(action, "update_item patch cannot be empty");
      continue;
    }

    validActions.push({ ...action, payload: { ...action.payload, tripId: ownedTripId } } as AssistantAction);
  }

  if (input.actions.length > MAX_ACTIONS) {
    warnings.push(`Only the first ${MAX_ACTIONS} assistant actions were validated.`);
  }

  return { validActions, rejectedActions, warnings };
}
