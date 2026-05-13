import test from "node:test";
import assert from "node:assert/strict";
import { applyRevisionInstructionToProfile } from "@/server/chat/tripRevision";
import type { TripProfile } from "@/types";

function makeProfile(): TripProfile {
  return {
    destination: "熊本",
    duration_days: 5,
    duration_nights: 4,
    departure_location: "台北",
    travel_dates: null,
    companions: "couple_or_friend",
    traveler_count: 2,
    budget: "mid_range",
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: ["city_walk"],
    transportation: "public_transport",
    accommodation: null,
    visited_before: [],
    avoid_places: [],
    dietary_restrictions: [],
    disliked_activities: [],
    pace: "normal",
    output_format: "report",
  };
}

test("applyRevisionInstructionToProfile updates transport and pace", () => {
  const revised = applyRevisionInstructionToProfile(makeProfile(), "改成自駕，然後放慢步調");
  assert.equal(revised.transportation, "self_drive");
  assert.equal(revised.pace, "relaxed");
});

test("applyRevisionInstructionToProfile adds food preference", () => {
  const revised = applyRevisionInstructionToProfile(makeProfile(), "加入更多美食和小吃");
  assert.ok(revised.preferences.includes("food"));
});

test("applyRevisionInstructionToProfile reduces shopping intent", () => {
  const revised = applyRevisionInstructionToProfile(makeProfile(), "減少購物和逛街");
  assert.ok(!revised.preferences.includes("city_walk"));
  assert.ok(revised.disliked_activities.includes("shopping"));
});
