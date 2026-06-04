import assert from "node:assert/strict";
import test from "node:test";

import {
  runStructuredTripWorkflow,
  type StructuredTripWorkflowDependencies,
} from "@/server/services/travelPlanningWorkflowService";
import type { ChatSource, QuestionCardPayload, TripProfile } from "@/types";

function makeProfile(): TripProfile {
  return {
    destination: "熊本",
    duration_days: 3,
    duration_nights: 2,
    departure_location: null,
    travel_dates: null,
    companions: null,
    traveler_count: null,
    budget: null,
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: [],
    transportation: null,
    accommodation: null,
    visited_before: [],
    avoid_places: [],
    dietary_restrictions: [],
    disliked_activities: [],
    pace: null,
    plan_integration: null,
  };
}

function makeQuestionCard(): QuestionCardPayload {
  return {
    response_type: "question_card",
    title: "AI 動態確認旅遊條件",
    questions: [
      {
        slot: "pace",
        type: "single_choice",
        question: "你希望行程節奏如何？",
        options: [{ label: "慢慢玩", value: "relaxed" }],
      },
    ],
    action: { label: "繼續" },
  };
}

function makeDeps(card: QuestionCardPayload | null): StructuredTripWorkflowDependencies {
  const profile = makeProfile();
  return {
    shouldHandle: () => true,
    publishProgress: () => undefined,
    mergeTripProfile: () => profile,
    updateTripProfileFromText: () => profile,
    applyQuestionAnswers: () => profile,
    buildFallbackQuestionCard: () => card,
    buildDynamicQuestionCard: async () => card || makeQuestionCard(),
    buildWaitingForInputStatusSteps: () => [
      { type: "status_step", phase: "waiting_user", label: "等待補充", status: "waiting_input" },
    ],
    buildPlanningStatusSteps: () => [
      { type: "status_step", phase: "compose", label: "完成", status: "completed" },
    ],
    profileToTripPlanRequest: () => ({
      destination: "熊本",
      days: 3,
      preferences: { interests: [], pace: "moderate", transportPreference: "public_transport" },
    }),
    generateTripPlan: async () => ({
      plan: {
        summary: "熊本三日",
        days: [{ dayNumber: 1, items: [{ id: "1", time: "09:00", title: "熊本城", type: "attraction" }] }],
      },
      sources: {},
    }),
    loadSupplementarySources: async () => ({}),
    mergeSources: (primary: Record<string, ChatSource>, supplementary: Record<string, ChatSource>) => ({
      ...primary,
      ...supplementary,
    }),
    registerSources: () => undefined,
    buildRevisionMeta: () => undefined,
    toTravelPlan: (plan) => ({
      response_type: "travel_plan",
      title: plan.summary,
      summary_table: [],
      days: [],
      weather_alerts: [],
      event_alerts: [],
      assumptions: [],
    }),
    now: () => "00:00",
  };
}

test("runStructuredTripWorkflow returns dynamic question card before planning when data is missing", async () => {
  const card = makeQuestionCard();
  const response = await runStructuredTripWorkflow(
    {
      message: "幫我規劃熊本行程",
    },
    makeDeps(card),
  );

  assert.equal(response?.reply.responseType, "question_card");
  assert.equal(response?.reply.questionCard?.title, "AI 動態確認旅遊條件");
  assert.equal(response?.reply.statusSteps?.[0]?.status, "waiting_input");
});

test("runStructuredTripWorkflow generates travel plan when no question card is needed", async () => {
  const response = await runStructuredTripWorkflow(
    {
      message: "幫我規劃熊本行程",
    },
    makeDeps(null),
  );

  assert.equal(response?.reply.responseType, "travel_plan");
  assert.equal(response?.reply.travelPlan?.title, "熊本三日");
  assert.equal(response?.itinerarySuggestion?.summary, "熊本三日");
  assert.equal(response?.tripProfile?.plan_integration, "direct_merge");
});

test("runStructuredTripWorkflow keeps self_merge when existing itinerary items already exist", async () => {
  const response = await runStructuredTripWorkflow(
    {
      message: "幫我規劃熊本行程",
      context: {
        destination: "熊本",
        days: 3,
        budget: 0,
        itinerary: [
          {
            dayNumber: 1,
            items: [{ id: "existing-1", time: "09:00", title: "既有熊本城", type: "attraction" }],
          },
        ],
        preferences: { interests: [], pace: "moderate" },
      },
    },
    makeDeps(null),
  );

  assert.equal(response?.reply.responseType, "travel_plan");
  assert.equal(response?.tripProfile?.plan_integration, "self_merge");
});
