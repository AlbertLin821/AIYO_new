import assert from "node:assert/strict";
import test from "node:test";
import { parseTripPlanResponse, StructuredOutputError } from "@/server/ai/responseParser";
import type { TripPlanRequest } from "@/types";

const request: TripPlanRequest = {
  destination: "台南",
  days: 2,
  preferences: {
    interests: ["food", "history"],
    pace: "moderate",
    transportPreference: "Train",
    mustVisit: ["神農街"],
    avoid: ["酒吧"],
  },
};

test("parseTripPlanResponse parses direct valid JSON", () => {
  const raw = JSON.stringify({
    summary: "台南兩日行程",
    days: [
      {
        dayNumber: 1,
        theme: "老城",
        items: [
          { time: "09:00", title: "神農街", type: "attraction" },
          { time: "12:00", title: "午餐", type: "restaurant" },
        ],
      },
    ],
  });

  const parsed = parseTripPlanResponse(raw, request);
  assert.equal(parsed.result.days[0].items[0].title, "神農街");
  assert.equal(parsed.diagnostics.parseMode, "normalized");
});

test("parseTripPlanResponse repairs alias keys and malformed times", () => {
  const raw = JSON.stringify({
    summary: "Trip",
    day: {
      dayNo: 1,
      activities: [
        { title: "神農街", time: "9:0", type: "sightseeing", desc: "walk" },
        { title: "午餐", time: "13", type: "food" },
      ],
    },
  });

  const parsed = parseTripPlanResponse(raw, request);
  assert.equal(parsed.result.days.length, 1);
  assert.equal(parsed.result.days[0].items[0].time, "09:00");
  assert.equal(parsed.result.days[0].items[1].type, "restaurant");
  assert.equal(parsed.diagnostics.parseMode, "normalized");
});

test("parseTripPlanResponse reports avoid pollution and must-visit issues in warnings", () => {
  const raw = JSON.stringify({
    summary: "Trip",
    days: [
      {
        dayNumber: 1,
        items: [
          { time: "10:00", title: "酒吧巡禮", type: "activity" },
        ],
      },
    ],
  });

  const parsed = parseTripPlanResponse(raw, request);
  const warnings = parsed.result.warnings || [];
  assert.ok(warnings.some((warning) => warning.startsWith("QUALITY:MUST_VISIT_UNCOVERED")));
  assert.ok(warnings.some((warning) => warning.startsWith("QUALITY:AVOID_POLLUTION")));
});

test("parseTripPlanResponse throws when JSON block is missing", () => {
  assert.throws(
    () => parseTripPlanResponse("no json here", request),
    (error: unknown) =>
      error instanceof StructuredOutputError &&
      error.message === "MODEL_OUTPUT_JSON_MISSING",
  );
});

