import test from "node:test";
import assert from "node:assert/strict";
import {
  getEffectiveTripDayCount,
  normalizeTripBudget,
  normalizeTripDayCount,
  summarizeShrinkDaysImpact,
} from "./tripMetaEdit";
import type { TripPlanDay } from "@/types";

test("normalizeTripDayCount clamps to 1-30", () => {
  assert.equal(normalizeTripDayCount(0), 1);
  assert.equal(normalizeTripDayCount(3.8), 3);
  assert.equal(normalizeTripDayCount(99), 30);
});

test("normalizeTripBudget floors at zero", () => {
  assert.equal(normalizeTripBudget(-5), 0);
  assert.equal(normalizeTripBudget(12000.9), 12000);
});

test("summarizeShrinkDaysImpact counts removed activities", () => {
  const itinerary: TripPlanDay[] = [
    { dayNumber: 1, theme: "Day 1", summary: "", items: [{ id: "a", title: "A" } as TripPlanDay["items"][number]] },
    { dayNumber: 2, theme: "Day 2", summary: "", items: [] },
    { dayNumber: 3, theme: "Day 3", summary: "", items: [{ id: "b", title: "B" } as TripPlanDay["items"][number], { id: "c", title: "C" } as TripPlanDay["items"][number]] },
  ];

  assert.deepEqual(summarizeShrinkDaysImpact(itinerary, 3, 4), {
    willShrink: false,
    fromDays: 3,
    toDays: 4,
    removedActivityCount: 0,
  });

  assert.deepEqual(summarizeShrinkDaysImpact(itinerary, 3, 2), {
    willShrink: true,
    fromDays: 3,
    toDays: 2,
    removedActivityCount: 2,
  });
});

test("getEffectiveTripDayCount prefers itinerary length", () => {
  const itinerary: TripPlanDay[] = [
    { dayNumber: 1, theme: "Day 1", summary: "", items: [] },
    { dayNumber: 2, theme: "Day 2", summary: "", items: [] },
  ];
  assert.equal(getEffectiveTripDayCount(itinerary, 5), 2);
  assert.equal(getEffectiveTripDayCount([], 5), 5);
});
