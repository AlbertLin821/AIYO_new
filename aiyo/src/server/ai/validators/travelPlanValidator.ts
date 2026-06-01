import {
  validateItineraryQuality,
  type ItineraryQualityIssue,
} from "@/server/ai/planning/itineraryQualityValidator";
import {
  TravelPlanResponseSchema,
  TripPlanResultSchema,
} from "@/server/ai/schemas/travelPlanningSchemas";
import type { TravelPlanResponse, TripPlanRequest, TripPlanResult } from "@/types";

export type TravelPlanValidationIssue = ItineraryQualityIssue;

function issue(path: string, message: string): TravelPlanValidationIssue {
  return { path, message };
}

export function validateTripPlanResultShape(value: unknown): {
  data?: TripPlanResult;
  issues: TravelPlanValidationIssue[];
} {
  const parsed = TripPlanResultSchema.safeParse(value);
  if (parsed.success) {
    return { data: parsed.data, issues: [] };
  }
  return {
    issues: parsed.error.issues.map((item) => issue(item.path.join(".") || "$", item.message)),
  };
}

export function validateTravelPlanResponseShape(value: unknown): {
  data?: TravelPlanResponse;
  issues: TravelPlanValidationIssue[];
} {
  const parsed = TravelPlanResponseSchema.safeParse(value);
  if (parsed.success) {
    return { data: parsed.data as TravelPlanResponse, issues: [] };
  }
  return {
    issues: parsed.error.issues.map((item) => issue(item.path.join(".") || "$", item.message)),
  };
}

export function validateTripPlanQuality(
  plan: TripPlanResult,
  request?: Pick<TripPlanRequest, "days" | "preferences" | "destination">,
): TravelPlanValidationIssue[] {
  if (!request?.days) {
    return [];
  }
  const fullRequest = {
    destination: request.destination || "",
    days: request.days,
    preferences: request.preferences || { interests: [], pace: "moderate", transportPreference: "public_transport" },
  } satisfies TripPlanRequest;
  return validateItineraryQuality(plan, fullRequest);
}

function collectCitationIssues(
  citations: string[] | undefined,
  sourceIds: Set<string>,
  path: string,
): TravelPlanValidationIssue[] {
  if (!citations?.length) {
    return [];
  }
  return citations
    .filter((citation) => !sourceIds.has(citation))
    .map((citation) => issue(path, `Citation source id is not registered: ${citation}.`));
}

export function validateTravelPlanResponseQuality(plan: TravelPlanResponse): TravelPlanValidationIssue[] {
  const shape = validateTravelPlanResponseShape(plan);
  const issues = [...shape.issues];
  const sourceIds = new Set(Object.keys(plan.sources || {}));
  if (!sourceIds.size) {
    return issues;
  }

  issues.push(...collectCitationIssues(plan.citations, sourceIds, "citations"));
  plan.summary_table.forEach((row, index) => {
    issues.push(...collectCitationIssues(row.citations, sourceIds, `summary_table.${index}.citations`));
  });
  plan.days.forEach((day, dayIndex) => {
    issues.push(...collectCitationIssues(day.citations, sourceIds, `days.${dayIndex}.citations`));
    day.transportation.forEach((item, index) => {
      issues.push(...collectCitationIssues(item.citations, sourceIds, `days.${dayIndex}.transportation.${index}.citations`));
    });
    day.spots.forEach((item, index) => {
      issues.push(...collectCitationIssues(item.citations, sourceIds, `days.${dayIndex}.spots.${index}.citations`));
    });
    day.food_recommendations.forEach((item, index) => {
      issues.push(
        ...collectCitationIssues(item.citations, sourceIds, `days.${dayIndex}.food_recommendations.${index}.citations`),
      );
    });
    day.tips.forEach((item, index) => {
      issues.push(...collectCitationIssues(item.citations, sourceIds, `days.${dayIndex}.tips.${index}.citations`));
    });
  });
  plan.weather_alerts.forEach((alert, index) => {
    issues.push(...collectCitationIssues(alert.citations, sourceIds, `weather_alerts.${index}.citations`));
  });
  plan.event_alerts.forEach((alert, index) => {
    issues.push(...collectCitationIssues(alert.citations, sourceIds, `event_alerts.${index}.citations`));
  });
  plan.assumptions.forEach((item, index) => {
    issues.push(...collectCitationIssues(item.citations, sourceIds, `assumptions.${index}.citations`));
  });

  return issues;
}
