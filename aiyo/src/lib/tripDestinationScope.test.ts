import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  clearTripDestinationScopeCacheForTests,
  geocodeResultFailsDestinationScope,
  inferCountryCodeFromCoordinates,
  isExplicitDepartureOrForeignPlace,
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

test("inferCountryCodeFromCoordinates distinguishes Taiwan from Japan", () => {
  assert.equal(inferCountryCodeFromCoordinates(25.0823855, 121.2363783), "TW");
  assert.equal(inferCountryCodeFromCoordinates(35.6595, 139.7005), "JP");
});

test("geocodeResultFailsDestinationScope allows Taoyuan airport coords for Japan scope when explicit departure", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  assert.equal(
    geocodeResultFailsDestinationScope(
      {
        lat: 25.0823855,
        lng: 121.2363783,
        formattedAddress: "337台灣桃園市大園區三石里航站南路",
        placeName: "桃園機場",
      },
      scope,
    ),
    null,
  );
  assert.equal(isExplicitDepartureOrForeignPlace("桃園國際機場", "TW"), true);
});

test("geocodeResultFailsDestinationScope rejects Queenstown mis-geocoded in Taiwan", () => {
  const scope = resolveTripDestinationScope("台灣臺東縣");
  assert.ok(scope);
  const failure = geocodeResultFailsDestinationScope(
    {
      lat: 24.9178238,
      lng: 121.4342733,
      formattedAddress: "237新北市三峽區",
      placeName: "皇后鎮",
    },
    scope,
  );
  assert.ok(failure);
  assert.match(failure, /outside Taiwan video scope/i);
});

test("geocodeResultFailsDestinationScope rejects vague Taiwan-only geocode for foreign place", () => {
  const scope = resolveTripDestinationScope("台灣");
  assert.ok(scope);
  const failure = geocodeResultFailsDestinationScope(
    {
      countryCode: "TW",
      lat: 23.9036873,
      lng: 121.0793705,
      formattedAddress: "台灣臺灣",
      placeName: "Fergburger",
    },
    scope,
  );
  assert.ok(failure);
});

test("geocodeResultFailsDestinationScope accepts Penghu place when address matches scope", () => {
  const scope = resolveTripDestinationScope("澎湖");
  assert.ok(scope);
  const failure = geocodeResultFailsDestinationScope(
    {
      countryCode: "TW",
      lat: 23.5638542,
      lng: 119.5609494,
      formattedAddress: "880台灣澎湖縣馬公市復興里新復路2巷22號",
      placeName: "篤行十村",
    },
    scope,
  );
  assert.equal(failure, null);
});

test("geocodeResultFailsDestinationScope rejects mis-geocoded Sapporo in Taiwan for Japan scope", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  const failure = geocodeResultFailsDestinationScope(
    {
      lat: 25.033,
      lng: 121.565,
      formattedAddress: "台北市",
      placeName: "札幌",
    },
    scope,
  );
  assert.ok(failure);
  assert.match(failure, /outside trip destination scope|conflicts with place name/i);
});

test("isTextInTripDestinationScope rejects Taiwan address for JP scope", () => {
  const scope = resolveTripDestinationScope("日本");
  assert.ok(scope);
  assert.equal(
    isTextInTripDestinationScope("337台灣桃園市大園區", scope, { strictCountryLevel: true }),
    false,
  );
});
