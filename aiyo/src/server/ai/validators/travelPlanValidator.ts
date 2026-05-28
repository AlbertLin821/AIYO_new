import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import {
  TravelPlanResponseSchema,
  TripPlanResultSchema,
} from "@/server/ai/schemas/travelPlanningSchemas";
import type { TravelPlanResponse, TripPlanRequest, TripPlanResult } from "@/types";

export type TravelPlanValidationIssue = {
  path: string;
  message: string;
};

function issue(path: string, message: string): TravelPlanValidationIssue {
  return { path, message };
}

function minutesFromTime(value: string): number | null {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    return null;
  }
  return hour * 60 + minute;
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
  request?: Pick<TripPlanRequest, "days" | "preferences">,
): TravelPlanValidationIssue[] {
  const issues: TravelPlanValidationIssue[] = [];

  if (request?.days && plan.days.length !== request.days) {
    issues.push(issue("days", `Expected ${request.days} days but got ${plan.days.length}.`));
  }

  plan.days.forEach((day, dayIndex) => {
    if (day.items.length < 4 || day.items.length > 7) {
      issues.push(issue(`days.${dayIndex}.items`, "Each day should contain 4 to 7 itinerary items."));
    }

    let previousMinutes = -1;
    day.items.forEach((item, itemIndex) => {
      const currentMinutes = minutesFromTime(item.time);
      if (currentMinutes === null) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}.time`, "Item time must be HH:MM."));
      } else if (currentMinutes < previousMinutes) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}.time`, "Item times must be chronological."));
      }
      previousMinutes = currentMinutes ?? previousMinutes;

      if (/[・、,/／]|周邊(?:午餐|晚餐)|(?:午餐|晚餐)與散步/u.test(item.title)) {
        issues.push(
          issue(
            `days.${dayIndex}.items.${itemIndex}.title`,
            "Item title must be one searchable place or venue name.",
          ),
        );
      }

      if (item.location && !hasUsableMapCoordinate(item.location)) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}.location`, "Location coordinates must be usable."));
      }

      const avoidTerms = request?.preferences.avoid || [];
      const pollutedAvoid = avoidTerms.find(
        (term) => term && `${item.title} ${item.notes || ""} ${item.location?.name || ""}`.includes(term),
      );
      if (pollutedAvoid) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}`, `Avoid term appeared: ${pollutedAvoid}.`));
      }
    });
  });

  return issues;
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
