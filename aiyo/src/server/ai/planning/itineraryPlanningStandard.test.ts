import assert from "node:assert/strict";
import test from "node:test";
import {
  getDayItemCountBounds,
  isForbiddenPlaceholderTitle,
  mealRequiresAreaNotes,
  resolveTripDayRole,
  suggestedMealTime,
} from "@/server/ai/planning/itineraryPlanningStandard";

test("resolveTripDayRole maps 3D2N day roles", () => {
  assert.equal(resolveTripDayRole(1, 3), "arrival");
  assert.equal(resolveTripDayRole(2, 3), "main");
  assert.equal(resolveTripDayRole(3, 3), "departure");
});

test("getDayItemCountBounds uses lighter arrival day", () => {
  assert.deepEqual(getDayItemCountBounds(1, 3), { min: 3, max: 5 });
  assert.deepEqual(getDayItemCountBounds(2, 3), { min: 4, max: 7 });
});

test("meal helpers enforce area notes for generic titles", () => {
  assert.equal(mealRequiresAreaNotes("午餐", ""), true);
  assert.equal(mealRequiresAreaNotes("午餐", "於上野一帶用餐"), false);
  assert.equal(suggestedMealTime("lunch"), "12:30");
});

test("forbidden placeholder titles include fallback synthetic labels", () => {
  assert.equal(isForbiddenPlaceholderTitle("東京 代表性景點", "東京"), true);
  assert.equal(isForbiddenPlaceholderTitle("淺草寺", "東京"), false);
});
