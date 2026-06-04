import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreferenceDetailRows,
  buildPreferenceOverrideMessage,
  formatPreferenceSummary,
  hasMeaningfulReusablePreferences,
  isPreferenceOverrideMessage,
} from "@/lib/personalization/preferenceDisplay";

test("hasMeaningfulReusablePreferences ignores destination-only and days-only records", () => {
  assert.equal(hasMeaningfulReusablePreferences({ destination: "東京", days: 5 }), false);
  assert.equal(
    hasMeaningfulReusablePreferences({ travelStyle: ["美食"], pace: "moderate" }),
    true,
  );
});

test("formatPreferenceSummary prefers budget level and localized styles", () => {
  const summary = formatPreferenceSummary({
    budgetLevel: "medium",
    travelStyle: ["food", "shopping"],
    pace: "moderate",
    transportPreference: "地鐵",
  });
  assert.match(summary, /中等預算/);
  assert.match(summary, /美食/);
  assert.match(summary, /地鐵/);
});

test("isPreferenceOverrideMessage detects reuse panel submit copy", () => {
  const message = buildPreferenceOverrideMessage({
    budgetLevel: "high",
    travelStyle: ["food", "shopping"],
    pace: "relaxed",
    transportPreference: "Transit",
  });
  assert.equal(isPreferenceOverrideMessage(message), true);
  assert.equal(isPreferenceOverrideMessage("修改旅遊偏好"), false);
});

test("buildPreferenceDetailRows labels prior destination when current trip differs", () => {
  const rows = buildPreferenceDetailRows(
    { destination: "大阪", days: 4, budgetLevel: "low" },
    { currentDestination: "東京", currentDays: 3 },
  );
  assert.deepEqual(
    rows.map((row) => row.label),
    ["上次目的地", "上次天數", "預算等級"],
  );
});
