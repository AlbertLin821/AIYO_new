import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assessDailyOpeningHours } from "./openingHours";

describe("daily opening hours assessment", () => {
  it("checks fixed daily and overnight ranges", () => {
    assert.equal(assessDailyOpeningHours("Mo-Su 09:00-17:00", "14:00"), "open");
    assert.equal(assessDailyOpeningHours("09:00-17:00", "17:00"), "closed");
    assert.equal(assessDailyOpeningHours("20:00-02:00", "01:00"), "open");
    assert.equal(assessDailyOpeningHours("20:00-02:00", "03:00"), "closed");
    assert.equal(assessDailyOpeningHours("24/7", "23:45"), "open");
    assert.equal(assessDailyOpeningHours("09:00-17:00", "16:45"), "closing_soon");
  });

  it("does not guess weekday, holiday, or multi-window rules without dates", () => {
    assert.equal(assessDailyOpeningHours("Mo-Fr 09:00-17:00", "10:00"), "unknown");
    assert.equal(assessDailyOpeningHours("09:00-12:00,13:00-18:00", "14:00"), "unknown");
    assert.equal(assessDailyOpeningHours("Mo-Su 09:00-17:00; PH off", "10:00"), "unknown");
    assert.equal(assessDailyOpeningHours(undefined, "10:00"), "unknown");
  });

  it("checks simple weekday hours using the trip calendar date", () => {
    assert.equal(assessDailyOpeningHours("Mo-Fr 09:00-17:00", "10:00", "2026-11-06"), "open");
    assert.equal(assessDailyOpeningHours("Mo-Fr 09:00-17:00", "10:00", "2026-11-07"), "closed");
    assert.equal(assessDailyOpeningHours("Sa-Mo 09:00-17:00", "10:00", "2026-11-08"), "open");
    assert.equal(assessDailyOpeningHours("Mo-Fr 20:00-02:00", "01:00", "2026-11-07"), "unknown");
  });
});
