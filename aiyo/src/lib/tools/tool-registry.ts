import type { ChatToolStatus } from "@/lib/types/chat";

/**
 * 旅遊聊天管線中可能出現的工具／能力 id（對齊 PR3 tool-registry）。
 * 與 {@link ToolCallRecord.toolName} 字串可漸進對齊。
 */
export type TravelToolId =
  | "plan_intent"
  | "web_search"
  | "youtube_transcript"
  | "places_search"
  | "weather_lookup"
  | "route_estimate"
  | "itinerary_apply"
  | "compose_trip_reply"
  | "ground_sources";

export type TravelToolDefinition = {
  id: TravelToolId;
  /** 使用者可讀（zh-TW） */
  displayNameZh: string;
  /** 無需使用者每輪確認即可執行（仍受後端 allowItineraryMutation 等約束） */
  safeToAutoRun: boolean;
  /** 執行前應取得明確同意（例如大量費用、刪除行程） */
  requiresUserApproval: boolean;
  /** UI 預設對應的統一工具狀態 */
  defaultChatToolStatus: ChatToolStatus;
};

export const TRAVEL_CHAT_TOOLS = [
  {
    id: "plan_intent",
    displayNameZh: "理解行程意圖",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "planning",
  },
  {
    id: "web_search",
    displayNameZh: "網路搜尋",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "searching_web",
  },
  {
    id: "youtube_transcript",
    displayNameZh: "YouTube 內容",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "reading_youtube",
  },
  {
    id: "places_search",
    displayNameZh: "地點／景點查詢",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "searching_places",
  },
  {
    id: "weather_lookup",
    displayNameZh: "天氣資料",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "searching_web",
  },
  {
    id: "route_estimate",
    displayNameZh: "路程與移動估算",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "calculating_route",
  },
  {
    id: "itinerary_apply",
    displayNameZh: "寫入／修訂行程",
    safeToAutoRun: false,
    requiresUserApproval: true,
    defaultChatToolStatus: "updating_itinerary",
  },
  {
    id: "compose_trip_reply",
    displayNameZh: "生成行程回覆",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "planning",
  },
  {
    id: "ground_sources",
    displayNameZh: "來源對齊與引用",
    safeToAutoRun: true,
    requiresUserApproval: false,
    defaultChatToolStatus: "grounding_sources",
  },
] as const satisfies readonly TravelToolDefinition[];

const BY_ID = new Map(TRAVEL_CHAT_TOOLS.map((t) => [t.id, t]));

export function getTravelTool(id: TravelToolId): TravelToolDefinition | undefined {
  return BY_ID.get(id);
}

export function listTravelTools(): readonly TravelToolDefinition[] {
  return TRAVEL_CHAT_TOOLS;
}

export function isTravelToolId(value: string): value is TravelToolId {
  return BY_ID.has(value as TravelToolId);
}
