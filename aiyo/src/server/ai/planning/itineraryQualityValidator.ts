import { getItineraryItemTitleViolation } from "@/lib/itineraryPlaceTitle";
import { hasUsableMapCoordinate } from "@/lib/geoCoordinates";
import { isTextInTripDestinationScope } from "@/lib/tripDestinationScope";
import {
  getDayItemCountBounds,
  INSUFFICIENT_RESEARCH_WARNING,
  isForbiddenPlaceholderTitle,
  mealRequiresAreaNotes,
  resolveTripDayRole,
} from "@/server/ai/planning/itineraryPlanningStandard";
import type { TripDestinationScope } from "@/lib/tripDestinationScope";
import type { TripPlanRequest, TripPlanResult } from "@/types";

export type ItineraryQualityIssue = {
  path: string;
  message: string;
};

export type ItineraryQualityOptions = {
  destinationScope?: TripDestinationScope | null;
  researchInsufficient?: boolean;
};

const ALLOWED_TYPES = new Set([
  "attraction",
  "restaurant",
  "transport",
  "hotel",
  "activity",
  "shopping",
]);

function issue(path: string, message: string): ItineraryQualityIssue {
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

function isMealItem(type: string, title: string): boolean {
  if (type === "restaurant") {
    return true;
  }
  return /午餐|晚餐|Lunch|Dinner/i.test(title);
}

function normalizeConcreteTitle(title: string): string {
  return title.trim().toLowerCase();
}

function shouldCheckDuplicateTitle(type: string, title: string): boolean {
  if (!title.trim()) {
    return false;
  }
  if (type === "transport" || type === "hotel") {
    return false;
  }
  if (isMealItem(type, title)) {
    return false;
  }
  if (/^(早餐|午餐|晚餐)$/u.test(title.trim())) {
    return false;
  }
  return true;
}

function dayHasMeal(
  day: TripPlanResult["days"][number],
  kind: "lunch" | "dinner",
): boolean {
  return day.items.some((item) => {
    if (!isMealItem(item.type, item.title)) {
      return false;
    }
    if (kind === "lunch") {
      return /午餐|Lunch/i.test(item.title);
    }
    return /晚餐|Dinner/i.test(item.title);
  });
}

export function validateItineraryQuality(
  plan: TripPlanResult,
  request: TripPlanRequest,
  options?: ItineraryQualityOptions,
): ItineraryQualityIssue[] {
  const issues: ItineraryQualityIssue[] = [];
  const totalDays = request.days;
  const titleUsage = new Map<string, number[]>();

  if (plan.days.length !== totalDays) {
    issues.push(issue("days", `Expected ${totalDays} days but got ${plan.days.length}.`));
  }

  if (options?.researchInsufficient) {
    const warnings = plan.warnings || [];
    if (!warnings.some((warning) => warning.includes(INSUFFICIENT_RESEARCH_WARNING))) {
      issues.push(issue("warnings", `Must include ${INSUFFICIENT_RESEARCH_WARNING}.`));
    }
  }

  plan.days.forEach((day, dayIndex) => {
    const dayNumber = day.dayNumber || dayIndex + 1;
    const bounds = getDayItemCountBounds(dayNumber, totalDays);
    if (!options?.researchInsufficient && (day.items.length < bounds.min || day.items.length > bounds.max)) {
      issues.push(
        issue(
          `days.${dayIndex}.items`,
          `Day ${dayNumber} should contain ${bounds.min}-${bounds.max} items.`,
        ),
      );
    }

    let previousMinutes = -1;
    day.items.forEach((item, itemIndex) => {
      const currentMinutes = minutesFromTime(item.time);
      if (currentMinutes === null) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}.time`, "Item time must be HH:MM."));
      } else if (currentMinutes < previousMinutes) {
        issues.push(
          issue(`days.${dayIndex}.items.${itemIndex}.time`, "Item times must be chronological."),
        );
      }
      previousMinutes = currentMinutes ?? previousMinutes;

      if (!ALLOWED_TYPES.has(item.type)) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}.type`, "Item type is not allowed."));
      }

      if (!item.transport?.trim()) {
        issues.push(
          issue(`days.${dayIndex}.items.${itemIndex}.transport`, "Transport must not be empty."),
        );
      }

      const titleViolation = getItineraryItemTitleViolation(item.title);
      if (titleViolation) {
        issues.push(
          issue(
            `days.${dayIndex}.items.${itemIndex}.title`,
            `Title violates itinerary contract: ${titleViolation}.`,
          ),
        );
      }
      if (isForbiddenPlaceholderTitle(item.title, request.destination)) {
        issues.push(
          issue(`days.${dayIndex}.items.${itemIndex}.title`, "Title must not use placeholder labels."),
        );
      }
      if (mealRequiresAreaNotes(item.title, item.notes)) {
        issues.push(
          issue(
            `days.${dayIndex}.items.${itemIndex}.notes`,
            "Generic meal titles require dining area notes.",
          ),
        );
      }

      if (item.location && !hasUsableMapCoordinate(item.location)) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}.location`, "Location coordinates must be usable."));
      }

      if (
        options?.destinationScope &&
        !isTextInTripDestinationScope(
          `${item.title} ${item.location?.name || ""} ${item.location?.address || ""} ${item.notes || ""}`,
          options.destinationScope,
        )
      ) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}`, "Item appears outside destination scope."));
      }

      const avoidTerms = request.preferences.avoid || [];
      const pollutedAvoid = avoidTerms.find(
        (term) => term && `${item.title} ${item.notes || ""} ${item.location?.name || ""}`.includes(term),
      );
      if (pollutedAvoid) {
        issues.push(issue(`days.${dayIndex}.items.${itemIndex}`, `Avoid term appeared: ${pollutedAvoid}.`));
      }

      if (shouldCheckDuplicateTitle(item.type, item.title)) {
        const normalizedTitle = normalizeConcreteTitle(item.title);
        titleUsage.set(normalizedTitle, [...(titleUsage.get(normalizedTitle) || []), dayNumber]);
      }
    });

    const role = resolveTripDayRole(dayNumber, totalDays);
    if (role === "departure" && day.items.length > 0) {
      const lastItem = day.items[day.items.length - 1];
      const lastMinutes = minutesFromTime(lastItem.time);
      if (lastMinutes !== null && lastMinutes > 17 * 60) {
        issues.push(issue(`days.${dayIndex}.items`, "Final day last item should end before 17:00."));
      }
    }
  });

  if (totalDays === 3) {
    const day1 = plan.days.find((day) => day.dayNumber === 1) || plan.days[0];
    const day2 = plan.days.find((day) => day.dayNumber === 2) || plan.days[1];
    const day3 = plan.days.find((day) => day.dayNumber === 3) || plan.days[2];
    if (day1 && !dayHasMeal(day1, "dinner")) {
      issues.push(issue("days.0.items", "Day 1 should include dinner for a 3-day trip."));
    }
    if (day2) {
      if (!dayHasMeal(day2, "lunch")) {
        issues.push(issue("days.1.items", "Day 2 should include lunch for a 3-day trip."));
      }
      if (!dayHasMeal(day2, "dinner")) {
        issues.push(issue("days.1.items", "Day 2 should include dinner for a 3-day trip."));
      }
    }
    if (day3 && !dayHasMeal(day3, "lunch")) {
      issues.push(issue("days.2.items", "Day 3 should include lunch for a 3-day trip."));
    }
  }

  for (const [title, dayNumbers] of titleUsage.entries()) {
    const uniqueDays = [...new Set(dayNumbers)];
    if (uniqueDays.length > 1) {
      issues.push(
        issue(
          "days",
          `Concrete place should not repeat across days without explicit revisit request: ${title}.`,
        ),
      );
    }
  }

  return issues;
}
