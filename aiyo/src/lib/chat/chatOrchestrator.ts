/**
 * 聊天／行程管線編排入口（PR3 薄層）：統一 re-export 工具登錄與狀態橋接。
 * 重度邏輯仍由 `travelPlannerService`、`publishChatProgress` 等既有模組負責。
 */

export {
  statusStepToChatToolStatus,
  inferChatToolStatusFromSteps,
  formatChatToolStatusLabel,
} from "./chatToolBridge";

export {
  TRAVEL_CHAT_TOOLS,
  getTravelTool,
  listTravelTools,
  isTravelToolId,
  type TravelToolId,
  type TravelToolDefinition,
} from "@/lib/tools/tool-registry";
