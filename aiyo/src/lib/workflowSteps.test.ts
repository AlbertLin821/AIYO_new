import assert from "node:assert/strict";
import test from "node:test";

import {
  buildWorkflowSteps,
  getProgressLabel,
  getProgressBadge,
  getProgressPercent,
  type WorkflowStepView,
} from "./workflowSteps";

const COMPLETE_STEPS: WorkflowStepView[] = [
  {
    key: "understand",
    label: "了解你的旅遊需求",
    status: "completed",
    stepNumber: 1,
    userTitle: "了解你的旅遊需求",
    userDescription: "",
  },
  {
    key: "plan",
    label: "規劃要查哪些資料",
    status: "completed",
    stepNumber: 2,
    userTitle: "規劃要查哪些資料",
    userDescription: "",
  },
  {
    key: "research",
    label: "搜尋景點與交通",
    status: "completed",
    stepNumber: 3,
    userTitle: "搜尋景點與交通",
    userDescription: "",
  },
  {
    key: "compose",
    label: "整理完整行程",
    status: "completed",
    stepNumber: 4,
    userTitle: "整理完整行程",
    userDescription: "",
  },
];

test("getProgressLabel reports completion instead of last step heading", () => {
  assert.equal(getProgressBadge(COMPLETE_STEPS), "已完成");
  assert.equal(getProgressLabel(COMPLETE_STEPS), "行程已整理完成");
});

test("buildWorkflowSteps uses the latest phase status instead of stale running events", () => {
  const steps = buildWorkflowSteps([
    { type: "status_step", phase: "understand", label: "理解需求", status: "running" },
    { type: "status_step", phase: "understand", label: "理解需求", status: "completed" },
    { type: "status_step", phase: "plan", label: "規劃查詢", status: "running" },
    { type: "status_step", phase: "plan", label: "規劃查詢", status: "completed" },
    { type: "status_step", phase: "research", label: "搜尋資料", status: "running" },
    { type: "status_step", phase: "research", label: "搜尋資料", status: "completed" },
    { type: "status_step", phase: "compose", label: "整理行程", status: "running" },
  ]);

  assert.deepEqual(
    steps.map((step) => step.status),
    ["completed", "completed", "completed", "running"],
  );
  assert.equal(getProgressPercent(steps), 87.5);
});
