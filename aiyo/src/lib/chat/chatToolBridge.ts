import type { ChatToolStatus } from "@/lib/types/chat";
import type { StatusStepPayload } from "@/types";

/** 將單一進度步驟對應到統一的 {@link ChatToolStatus}（供進度列／工具徽章）。 */
export function statusStepToChatToolStatus(step: StatusStepPayload): ChatToolStatus {
  if (step.status === "failed") {
    return "error";
  }

  if (step.provider === "tavily" || step.provider === "searxng" || step.provider === "serper" || step.provider === "mock_web") {
    return "searching_web";
  }
  if (step.provider === "youtube") {
    return "reading_youtube";
  }
  if (step.provider === "google_places") {
    return "searching_places";
  }
  if (step.provider === "open_meteo") {
    return "searching_web";
  }

  if (step.phase === "research" && step.sourceIds?.length) {
    return "grounding_sources";
  }

  switch (step.phase) {
    case "understand":
    case "plan":
    case "waiting_user":
      return "planning";
    case "research":
      return "searching_web";
    case "compose":
      return "planning";
    default:
      return "planning";
  }
}

/**
 * 從目前為止收到的所有 `status_step` 事件推斷「當前工具狀態」。
 * 優先採用最後一筆 `running`，其次有失敗則 `error`，全部完成則 `done`。
 */
export function inferChatToolStatusFromSteps(steps: StatusStepPayload[]): ChatToolStatus {
  if (!steps.length) {
    return "idle";
  }
  if (steps.some((s) => s.status === "failed")) {
    return "error";
  }

  const running = steps.filter((s) => s.status === "running");
  if (running.length) {
    return statusStepToChatToolStatus(running[running.length - 1]);
  }

  if (steps.some((s) => s.status === "waiting_input")) {
    return "planning";
  }

  if (steps.length > 0 && steps.every((s) => s.status === "completed")) {
    return "done";
  }

  return "planning";
}

const LABEL_ZH: Record<ChatToolStatus, string> = {
  idle: "待命",
  planning: "規劃與推理",
  searching_web: "搜尋網路／外部資料",
  reading_youtube: "讀取 YouTube 相關內容",
  searching_places: "查詢地點與景點",
  calculating_route: "估算路線與移動",
  updating_itinerary: "更新行程資料",
  grounding_sources: "對齊來源與引用",
  done: "已完成",
  error: "發生錯誤",
};

export function formatChatToolStatusLabel(status: ChatToolStatus): string {
  return LABEL_ZH[status] ?? status;
}
