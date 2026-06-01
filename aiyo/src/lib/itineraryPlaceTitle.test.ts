import assert from "node:assert/strict";
import test from "node:test";
import {
  extractPrimaryPlaceName,
  getItineraryItemTitleViolation,
  isMealSyntheticTitle,
  isSyntheticFallbackPlaceName,
  parseDayThemeStops,
} from "@/lib/itineraryPlaceTitle";

test("getItineraryItemTitleViolation rejects polluted AI titles", () => {
  assert.equal(getItineraryItemTitleViolation("歷史文化體驗 湧湧座"), "interest_prefix");
  assert.equal(getItineraryItemTitleViolation("歷史文化體驗 湧湧座 周邊午餐"), "interest_prefix");
  assert.equal(getItineraryItemTitleViolation("熊本城 晚餐與散步"), "meal_suffix");
  assert.equal(getItineraryItemTitleViolation("熊本城・白川水源"), "multi_place");
  assert.equal(getItineraryItemTitleViolation("熊本老城區散步"), "synthetic_fallback");
  assert.equal(getItineraryItemTitleViolation("湧湧座"), null);
  assert.equal(getItineraryItemTitleViolation("午餐"), null);
});

test("parseDayThemeStops splits theme segments into clean place names", () => {
  const stops = parseDayThemeStops({
    dayNumber: 7,
    theme: "歷史文化體驗 湧湧座・熊本城",
    summary: "第 7 天以 歷史文化體驗 湧湧座、熊本城 和沿線餐食安排為主，保留午晚餐與散步節奏。",
  });
  assert.equal(stops.morning, "湧湧座");
  assert.equal(stops.afternoon, "熊本城");
});

test("extractPrimaryPlaceName strips interest prefix and meal suffix for diagnostics", () => {
  assert.equal(extractPrimaryPlaceName("歷史文化體驗 湧湧座 周邊午餐"), "湧湧座");
  assert.equal(extractPrimaryPlaceName("熊本城 晚餐與散步"), "熊本城");
  assert.ok(isMealSyntheticTitle("湧湧座 附近午餐"));
  assert.ok(isSyntheticFallbackPlaceName("熊本夜景收尾"));
});
