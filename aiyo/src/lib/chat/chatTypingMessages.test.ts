import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChatTypingContext,
  pickFromPool,
  resolveChatTypingLabel,
  resolveTypingPoolKey,
} from "@/lib/chat/chatTypingMessages";
import type { StatusStepPayload } from "@/types";

const baseStep = (overrides: Partial<StatusStepPayload>): StatusStepPayload => ({
  type: "status_step",
  phase: "research",
  label: "搜尋",
  status: "running",
  ...overrides,
});

test("resolveTypingPoolKey maps preference confirmation and tool statuses", () => {
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "planning",
      travelAgentMode: "confirm_preferences",
      isStructuredPlanning: true,
    }),
    "preference",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "planning",
      hasPreferenceConfirmation: true,
      isStructuredPlanning: true,
    }),
    "preference",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "searching_web",
      isStructuredPlanning: true,
    }),
    "search",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "searching_places",
      isStructuredPlanning: true,
    }),
    "places",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "reading_youtube",
      isStructuredPlanning: true,
    }),
    "youtube",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "planning",
      activePhase: "compose",
      isStructuredPlanning: true,
    }),
    "compose",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "idle",
      isStructuredPlanning: false,
    }),
    "general",
  );
  assert.equal(
    resolveTypingPoolKey({
      toolStatus: "error",
      isStructuredPlanning: true,
    }),
    "error",
  );
});

test("pickFromPool is deterministic for seed and tick", () => {
  const pool = ["a", "b", "c"];
  assert.equal(pickFromPool(pool, 1, 0), pickFromPool(pool, 1, 0));
  assert.notEqual(pickFromPool(pool, 1, 0), pickFromPool(pool, 1, 1));
});

test("resolveChatTypingLabel rotates within the same pool", () => {
  const ctx = {
    toolStatus: "searching_web" as const,
    isStructuredPlanning: true,
  };
  const first = resolveChatTypingLabel(ctx, { seed: 2, tick: 0 });
  const second = resolveChatTypingLabel(ctx, { seed: 2, tick: 1 });
  assert.notEqual(first, second);
});

test("resolveChatTypingLabel switches pools when status changes", () => {
  const searchLabel = resolveChatTypingLabel(
    {
      toolStatus: "searching_web",
      isStructuredPlanning: true,
    },
    { seed: 0, tick: 0 },
  );
  const composeLabel = resolveChatTypingLabel(
    {
      toolStatus: "planning",
      activePhase: "compose",
      isStructuredPlanning: true,
    },
    { seed: 0, tick: 0 },
  );
  assert.notEqual(searchLabel, composeLabel);
});

test("buildChatTypingContext derives active phase from running steps", () => {
  const ctx = buildChatTypingContext({
    steps: [
      baseStep({ phase: "understand", status: "completed" }),
      baseStep({ phase: "research", provider: "serper" }),
    ],
    isStructuredPlanning: true,
  });
  assert.equal(ctx.toolStatus, "searching_web");
  assert.equal(ctx.activePhase, "research");
});
