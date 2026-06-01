import test from "node:test";
import assert from "node:assert/strict";
import {
  inferChatToolStatusFromSteps,
  statusStepToChatToolStatus,
  formatChatToolStatusLabel,
} from "@/lib/chat/chatToolBridge";
import type { StatusStepPayload } from "@/types";

const base = (overrides: Partial<StatusStepPayload>): StatusStepPayload => ({
  type: "status_step",
  phase: "research",
  label: "搜尋",
  status: "running",
  ...overrides,
});

test("statusStepToChatToolStatus maps providers", () => {
  assert.equal(statusStepToChatToolStatus(base({ provider: "tavily" })), "searching_web");
  assert.equal(statusStepToChatToolStatus(base({ provider: "serper" })), "searching_web");
  assert.equal(statusStepToChatToolStatus(base({ provider: "mock_web" })), "searching_web");
  assert.equal(statusStepToChatToolStatus(base({ provider: "youtube" })), "reading_youtube");
  assert.equal(statusStepToChatToolStatus(base({ provider: "google_places" })), "searching_places");
  assert.equal(statusStepToChatToolStatus(base({ provider: "open_meteo" })), "searching_web");
});

test("statusStepToChatToolStatus failed -> error", () => {
  assert.equal(statusStepToChatToolStatus(base({ status: "failed" })), "error");
});

test("inferChatToolStatusFromSteps prefers last running step", () => {
  const steps: StatusStepPayload[] = [
    base({ phase: "understand", status: "completed", label: "a" }),
    base({ provider: "tavily", label: "b" }),
    base({ provider: "youtube", label: "c" }),
  ];
  assert.equal(inferChatToolStatusFromSteps(steps), "reading_youtube");
});

test("inferChatToolStatusFromSteps all completed -> done", () => {
  const steps: StatusStepPayload[] = [
    base({ status: "completed", label: "x" }),
    base({ status: "completed", label: "y" }),
  ];
  assert.equal(inferChatToolStatusFromSteps(steps), "done");
});

test("formatChatToolStatusLabel returns zh-TW", () => {
  assert.match(formatChatToolStatusLabel("searching_places"), /景點/);
});
