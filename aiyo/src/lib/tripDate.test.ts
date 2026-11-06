import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTripStartDate, tripDayDate } from "./tripDate";

describe("trip calendar dates", () => {
  it("keeps dates as calendar days across month and leap-year boundaries", () => {
    assert.equal(tripDayDate("2028-02-28", 2), "2028-02-29");
    assert.equal(tripDayDate("2028-02-28", 3), "2028-03-01");
    assert.equal(tripDayDate(null, 1), null);
  });

  it("rejects impossible or non-calendar values", () => {
    assert.throws(() => parseTripStartDate("2027-02-29"), /validation_error/);
    assert.throws(() => parseTripStartDate("2027-02-01T00:00:00Z"), /validation_error/);
  });
});
