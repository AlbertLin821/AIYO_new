import type { AiProposedChange, AssistantAction } from "@/types";

export function dayIdFromDayNumber(day: number): string {
  return `day-${Math.max(1, Math.floor(day || 1))}`;
}

export function dayNumberFromDayId(dayId: string | number | undefined): number | null {
  if (typeof dayId === "number" && Number.isFinite(dayId)) {
    return Math.max(1, Math.floor(dayId));
  }
  const raw = String(dayId || "").trim();
  const match = raw.match(/(\d+)/);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
}

export function assistantActionToLegacyProposedChange(action: AssistantAction): AiProposedChange | null {
  switch (action.type) {
    case "itinerary.add_item": {
      const day = dayNumberFromDayId(action.payload.dayId);
      if (!day) return null;
      return {
        type: "add_itinerary_item",
        day,
        time: action.payload.item.startTime || "18:30",
        title: action.payload.item.title,
        locationName: action.payload.item.location || action.payload.item.title,
        notes: action.payload.item.notes || undefined,
        source: "ai-chat",
      };
    }
    case "itinerary.update_item": {
      const day = dayNumberFromDayId(action.payload.dayId) ?? undefined;
      return {
        type: "update_itinerary_item",
        day,
        itemId: action.payload.itemId,
        time: action.payload.patch.startTime || undefined,
        title: action.payload.patch.title || undefined,
        locationName: action.payload.patch.location || undefined,
        notes: action.payload.patch.notes || undefined,
        source: "ai-chat",
      };
    }
    case "itinerary.remove_item": {
      const day = dayNumberFromDayId(action.payload.dayId) ?? undefined;
      return {
        type: "remove_itinerary_item",
        day,
        itemId: action.payload.itemId,
        source: "ai-chat",
      };
    }
    default:
      return null;
  }
}

export function legacyProposedChangeToAssistantAction(change: AiProposedChange): AssistantAction | null {
  if (change.type === "add_itinerary_item") {
    return {
      type: "itinerary.add_item",
      payload: {
        dayId: dayIdFromDayNumber(change.day),
        item: {
          title: change.title,
          location: change.locationName || change.title,
          startTime: change.time,
          notes: change.notes || change.reason || null,
          source: "assistant",
        },
      },
    };
  }
  if (change.type === "update_itinerary_item") {
    const day = change.day ? dayIdFromDayNumber(change.day) : "day-1";
    if (!change.itemId) return null;
    return {
      type: "itinerary.update_item",
      payload: {
        dayId: day,
        itemId: change.itemId,
        patch: {
          title: change.title,
          location: change.locationName,
          startTime: change.time,
          notes: change.notes,
        },
      },
    };
  }
  if (change.type === "remove_itinerary_item") {
    const day = change.day ? dayIdFromDayNumber(change.day) : "day-1";
    if (!change.itemId) return null;
    return {
      type: "itinerary.remove_item",
      payload: {
        dayId: day,
        itemId: change.itemId,
      },
    };
  }
  return null;
}

export function mergeAssistantActionsWithLegacy(input: {
  assistantActions?: AssistantAction[];
  proposedChanges?: AiProposedChange[];
}): { assistantActions: AssistantAction[]; proposedChanges: AiProposedChange[] } {
  const assistantActions = [...(input.assistantActions || [])];
  const proposedChanges = [...(input.proposedChanges || [])];

  if (!assistantActions.length && proposedChanges.length) {
    assistantActions.push(
      ...proposedChanges
        .map((change) => legacyProposedChangeToAssistantAction(change))
        .filter((action): action is AssistantAction => Boolean(action)),
    );
  }

  if (!proposedChanges.length && assistantActions.length) {
    proposedChanges.push(
      ...assistantActions
        .map((action) => assistantActionToLegacyProposedChange(action))
        .filter((change): change is AiProposedChange => Boolean(change)),
    );
  }

  return { assistantActions, proposedChanges };
}
