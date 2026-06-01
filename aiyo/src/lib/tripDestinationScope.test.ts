import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearTripDestinationScopeCacheForTests,
  geocodeResultFailsDestinationScope,
  isGeocodeCountryInScope,
  isTextInTripDestinationScope,
  resolveTripDestinationScope,
} from "@/lib/tripDestinationScope";

afterEach(() => {
  clearTripDestinationScopeCacheForTests();
});

test("resolveTripDestinationScope for 日本 is country-level JP", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  assert.equal(scope?.countryCodes[0], "JP");
  assert.equal(scope?.isCountryLevel, true);
  assert.ok(scope?.positiveTokens.some((t) => /japan/i.test(t)));
  assert.ok(scope?.negativeRegionTokens.some((t) => /new york/i.test(t)));
});

test("isTextInTripDestinationScope rejects US-only title for JP scope", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  assert.equal(
    isTextInTripDestinationScope("New York travel guide — best things to do", scope),
    false,
  );
  assert.equal(isTextInTripDestinationScope("東京自由行攻略", scope), true);
});

test("isGeocodeCountryInScope enforces country codes", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  assert.equal(isGeocodeCountryInScope("JP", scope), true);
  assert.equal(isGeocodeCountryInScope("US", scope), false);
});

test("geocodeResultFailsDestinationScope rejects out-of-scope coordinates", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  assert.equal(
    geocodeResultFailsDestinationScope(
      { countryCode: "US", lat: 40.7128, lng: -74.006 },
      scope,
    ),
    "Geocoded country (US) is outside trip destination scope.",
  );
  assert.equal(
    geocodeResultFailsDestinationScope({ countryCode: "JP", lat: 35.6762, lng: 139.6503 }, scope),
    null,
  );
});
