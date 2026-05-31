import type { StatusStepPayload } from "@/types";
import {
  resolveChatTypingLabel,
  type ChatTypingContext,
} from "@/lib/chat/chatTypingMessages";

export const WORKFLOW_PHASE_ORDER = [
  "understand",
  "plan",
  "waiting_user",
  "research",
  "compose",
] as const;

export type WorkflowPhaseKey = (typeof WORKFLOW_PHASE_ORDER)[number];

const PHASE_META: Record<
  WorkflowPhaseKey,
  {
    userTitle: string;
    userDescription: string;
    waitingTitle?: string;
    waitingDescription?: string;
    failedDescription?: string;
  }
> = {
  understand: {
    userTitle: "了解你的旅遊需求",
    userDescription: "正在整理目的地、天數與旅行偏好",
    failedDescription: "需求整理時發生問題，請稍後再試一次。",
  },
  plan: {
    userTitle: "規劃要查哪些資料",
    userDescription: "決定接下來要搜尋的景點、交通與住宿範圍",
    failedDescription: "查詢範圍規劃時發生問題，系統可能無法完整搜尋外部資料。",
  },
  waiting_user: {
    userTitle: "確認行程條件",
    userDescription: "需要你補充出發地、日期、預算等資訊",
    waitingTitle: "等你補充行程條件",
    waitingDescription: "填寫完成後，系統會開始搜尋景點、交通與天氣",
    failedDescription: "條件收集流程發生問題，請重新填寫或稍後再試。",
  },
  research: {
    userTitle: "搜尋景點與交通",
    userDescription: "正在查詢景點推薦、移動方式與天氣資訊",
    failedDescription: "外部資料查詢遇到問題，系統會盡量用目前已取得的資料繼續規劃。",
  },
  compose: {
    userTitle: "整理完整行程",
    userDescription: "把查到的資料排成每日行程草案",
    failedDescription: "行程整理時發生問題，請稍後再試或調整需求。",
  },
};

const STATUS_RANK: Record<StatusStepPayload["status"], number> = {
  failed: 5,
  running: 4,
  waiting_input: 3,
  pending: 2,
  completed: 1,
};

export type WorkflowStepView = {
  key: string;
  label: string;
  status: StatusStepPayload["status"];
  detail?: string;
  stepNumber: number;
  userTitle: string;
  userDescription: string;
};

function pickDominantStatus(steps: StatusStepPayload[]): StatusStepPayload["status"] {
  return [...steps].sort((left, right) => STATUS_RANK[right.status] - STATUS_RANK[left.status])[0]?.status || "pending";
}

function resolveUserCopy(
  phase: WorkflowPhaseKey,
  status: StatusStepPayload["status"],
  serverDetail?: string,
): { userTitle: string; userDescription: string } {
  const meta = PHASE_META[phase];
  if (status === "waiting_input") {
    return {
      userTitle: meta.waitingTitle || meta.userTitle,
      userDescription: meta.waitingDescription || meta.userDescription,
    };
  }
  if (status === "failed") {
    return {
      userTitle: meta.userTitle,
      userDescription: meta.failedDescription || serverDetail?.trim() || meta.userDescription,
    };
  }
  return {
    userTitle: meta.userTitle,
    userDescription: serverDetail?.trim() || meta.userDescription,
  };
}

export function buildWorkflowSteps(steps: StatusStepPayload[]): WorkflowStepView[] {
  const hasPhases = steps.some((step) => step.phase);
  if (!hasPhases) {
    return steps.map((step, index) => ({
      key: step.label,
      label: step.label,
      status: step.status,
      detail: step.detail,
      stepNumber: index + 1,
      userTitle: step.label,
      userDescription: step.detail?.trim() || "系統正在處理這個步驟",
    }));
  }

  const built = WORKFLOW_PHASE_ORDER.map((phase) => {
    const matches = steps.filter((step) => step.phase === phase);
    if (!matches.length) {
      return null;
    }
    const last = matches[matches.length - 1];
    const status = pickDominantStatus(matches);
    const copy = resolveUserCopy(phase, status, last.detail || last.label);
    return {
      key: phase,
      label:
        status === "waiting_input" && PHASE_META[phase].waitingTitle
          ? PHASE_META[phase].waitingTitle!
          : PHASE_META[phase].userTitle,
      status,
      detail: last.detail || last.label,
      stepNumber: 0,
      userTitle: copy.userTitle,
      userDescription: copy.userDescription,
    };
  }).filter(Boolean) as WorkflowStepView[];

  return built.map((step, index) => ({
    ...step,
    stepNumber: index + 1,
  }));
}

export function getActiveWorkflowStep(steps: WorkflowStepView[]): WorkflowStepView | null {
  if (!steps.length) {
    return null;
  }
  const waiting = steps.find((step) => step.status === "waiting_input");
  if (waiting) {
    return waiting;
  }
  const running = steps.find((step) => step.status === "running");
  if (running) {
    return running;
  }
  const pending = steps.find((step) => step.status === "pending");
  if (pending) {
    return pending;
  }
  return steps[steps.length - 1] || null;
}

export function formatStepHeading(step: WorkflowStepView, totalSteps: number): string {
  return `步驟 ${step.stepNumber}／${totalSteps}：${step.userTitle}`;
}

export function getProgressBadge(steps: WorkflowStepView[]): string {
  if (!steps.length) {
    return "準備中";
  }
  if (steps.every((step) => step.status === "completed")) {
    return "已完成";
  }
  const waiting = steps.find((step) => step.status === "waiting_input");
  if (waiting) {
    return "等你回覆";
  }
  const running = steps.find((step) => step.status === "running");
  if (running) {
    return "處理中";
  }
  return "處理中";
}

export function getProgressLabel(steps: WorkflowStepView[]): string {
  const active = getActiveWorkflowStep(steps);
  if (!steps.length) {
    return "準備開始規劃";
  }
  if (steps.every((step) => step.status === "completed")) {
    return "行程已整理完成";
  }
  if (!active) {
    if (steps.some((step) => step.status === "waiting_input")) {
      return "等你回覆";
    }
    return "正在為你規劃行程";
  }
  if (active.status === "waiting_input") {
    return formatStepHeading(active, steps.length);
  }
  if (active.status === "running") {
    return `${formatStepHeading(active, steps.length)} · 進行中`;
  }
  return formatStepHeading(active, steps.length);
}

export function getProgressPercent(steps: WorkflowStepView[]): number {
  if (!steps.length) {
    return 0;
  }
  const completedCount = steps.filter((step) => step.status === "completed").length;
  const runningIndex = steps.findIndex((step) => step.status === "running");
  const waitingIndex = steps.findIndex((step) => step.status === "waiting_input");
  if (completedCount === steps.length) {
    return 100;
  }
  if (runningIndex >= 0) {
    return ((completedCount + 0.5) / steps.length) * 100;
  }
  if (waitingIndex >= 0) {
    return ((completedCount + 0.85) / steps.length) * 100;
  }
  return (completedCount / steps.length) * 100;
}

export function getStepStatusLabel(status: StatusStepPayload["status"]): string {
  switch (status) {
    case "completed":
      return "已完成";
    case "running":
      return "進行中";
    case "waiting_input":
      return "等你操作";
    case "failed":
      return "發生問題";
    default:
      return "稍後進行";
  }
}

export function getProcessingHint(
  activeStep: WorkflowStepView | null,
  typingContext?: ChatTypingContext | null,
): string {
  if (typingContext && activeStep?.status === "running") {
    return resolveChatTypingLabel(typingContext, { tick: 0 });
  }
  if (!activeStep) {
    return "系統正在為你處理，請稍候…";
  }
  switch (activeStep.status) {
    case "waiting_input":
      return "請在下方完成設定，送出後會自動繼續下一步。";
    case "running":
      return "這個步驟完成後，會自動進入下一階段。";
    case "completed":
      return "這個步驟已完成。";
    case "failed":
      return "這個步驟遇到問題，請稍後再試或調整需求。";
    default:
      return "即將開始處理這個步驟。";
  }
}
