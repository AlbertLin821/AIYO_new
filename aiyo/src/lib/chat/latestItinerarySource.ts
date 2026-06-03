import type { ChatMessage, TripPlanResult } from "@/types";
import {
  textItineraryToTripPlanResult,
  travelPlanResponseToTripPlanResult,
} from "@/lib/travelPlanConversion";

function resolveTargetDayCount(message: ChatMessage): number | undefined {
  const durationDays = message.tripProfile?.duration_days;
  return typeof durationDays === "number" && durationDays > 0 ? durationDays : undefined;
}

export function findLatestApplicableItinerarySource(
  messages: ChatMessage[],
): { message: ChatMessage; plan?: TripPlanResult } | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "assistant") {
      continue;
    }

    if (message.travelPlan) {
      return {
        message,
        plan: travelPlanResponseToTripPlanResult(message.travelPlan, {
          targetDayCount: resolveTargetDayCount(message),
        }),
      };
    }

    const parsedPlan = textItineraryToTripPlanResult(message.content, {
      targetDayCount: resolveTargetDayCount(message),
    });
    if (parsedPlan) {
      return { message, plan: parsedPlan };
    }
  }
  return null;
}
