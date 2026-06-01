import {
  isGeocodeCountryInScope,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
  type TripDestinationScope,
} from "@/lib/tripDestinationScope";
import { geocodePlace } from "@/server/places/geocodePlace";
import { resolveTripDestinationScopeWithGeocode } from "@/server/places/resolveTripDestinationScope";
import type { TripPlanItem, TripPlanResult } from "@/types";

export type FilterTripPlanScopeResult = {
  plan: TripPlanResult;
  removedCount: number;
};

export function resolveScopeForTripDestination(destination?: string | null): TripDestinationScope | null {
  return resolveTripDestinationScope(destination);
}

export async function resolveScopeForTripDestinationAsync(
  destination?: string | null,
): Promise<TripDestinationScope | null> {
  const fromCatalog = resolveTripDestinationScope(destination);
  if (fromCatalog?.countryCodes.length) {
    return fromCatalog;
  }
  const trimmed = destination?.trim();
  if (!trimmed) {
    return fromCatalog;
  }
  return (await resolveTripDestinationScopeWithGeocode(trimmed)) ?? fromCatalog;
}

export async function filterTripPlanByDestinationScope(
  plan: TripPlanResult,
  destination?: string | null,
  scopeInput?: TripDestinationScope | null,
): Promise<FilterTripPlanScopeResult> {
  const scope = scopeInput ?? (await resolveScopeForTripDestinationAsync(destination));
  if (!scope?.countryCodes.length) {
    return { plan, removedCount: 0 };
  }

  let removedCount = 0;
  const nextDays = [];

  for (const day of plan.days) {
    const keptItems: TripPlanItem[] = [];
    for (const item of day.items) {
      const text = [item.title, item.notes, item.location?.address, item.location?.name]
        .filter(Boolean)
        .join(" ");
      const hasScopedText = scope.isCountryLevel
        ? Boolean(
            item.location?.address?.trim() &&
              isTextInTripDestinationScope(item.location.address, scope),
          )
        : isTextInTripDestinationScope(text, scope);
      if (hasScopedText) {
        keptItems.push(item);
        continue;
      }

      const geocoded = await geocodePlace({
        query: item.title,
        destinationHint: scope.canonicalLabel,
        destinationScope: scope,
      });
      if (
        geocoded.ok &&
        isGeocodeCountryInScope(geocoded.place.countryCode, scope)
      ) {
        keptItems.push(item);
        continue;
      }

      removedCount += 1;
    }
    nextDays.push({ ...day, items: keptItems });
  }

  const warnings =
    removedCount > 0
      ? [
          ...(plan.warnings ?? []),
          `已略過 ${removedCount} 個與目的地（${scope.canonicalLabel}）不符的建議景點。`,
        ]
      : plan.warnings;

  return {
    plan: { ...plan, days: nextDays, warnings },
    removedCount,
  };
}
