import { inferChatToolStatusFromSteps } from "@/lib/chat/chatToolBridge";
import type { ChatToolStatus } from "@/lib/types/chat";
import { zhTW as t } from "@/locales/zh-TW";
import type { StatusStepPayload } from "@/types";

export type ChatTypingPoolKey =
  | "preference"
  | "search"
  | "places"
  | "youtube"
  | "route"
  | "compose"
  | "sources"
  | "planning"
  | "filler"
  | "general"
  | "error";

export type ChatTypingContext = {
  toolStatus: ChatToolStatus;
  activePhase?: string;
  travelAgentMode?: string | null;
  hasPreferenceConfirmation?: boolean;
  isStructuredPlanning: boolean;
};

export function resolveTypingPoolKey(ctx: ChatTypingContext): ChatTypingPoolKey {
  if (ctx.travelAgentMode === "confirm_preferences" || ctx.hasPreferenceConfirmation) {
    return "preference";
  }

  if (ctx.toolStatus === "error") {
    return "error";
  }

  switch (ctx.toolStatus) {
    case "searching_web":
      return "search";
    case "searching_places":
      return "places";
    case "reading_youtube":
      return "youtube";
    case "calculating_route":
      return "route";
    case "updating_itinerary":
      return "compose";
    case "grounding_sources":
      return "sources";
    default:
      break;
  }

  if (ctx.activePhase === "compose") {
    return "compose";
  }
  if (ctx.activePhase === "research") {
    return "search";
  }

  if (ctx.isStructuredPlanning) {
    if (ctx.toolStatus === "planning" || ctx.toolStatus === "idle") {
      return "planning";
    }
    return "filler";
  }

  return "general";
}

export function pickFromPool(pool: readonly string[], seed: number, tick: number): string {
  if (!pool.length) {
    return "";
  }
  const index = Math.abs(seed + tick) % pool.length;
  return pool[index] ?? pool[0] ?? "";
}

export function resolveChatTypingLabel(
  ctx: ChatTypingContext,
  options?: { seed?: number; tick?: number },
): string {
  const key = resolveTypingPoolKey(ctx);
  const pools = t.chat.typingMessages;
  const seed = options?.seed ?? 0;
  const tick = options?.tick ?? 0;

  let pool: readonly string[] = pools[key];
  if (key === "planning" && tick % 2 === 1) {
    pool = [...pool, ...pools.filler];
  }

  const picked = pickFromPool(pool, seed, tick);
  return picked || t.chat.assistantTyping;
}

export function buildChatTypingContext(params: {
  steps: StatusStepPayload[];
  travelAgentMode?: string | null;
  hasPreferenceConfirmation?: boolean;
  isStructuredPlanning: boolean;
}): ChatTypingContext {
  const toolStatus = inferChatToolStatusFromSteps(params.steps);
  const running = params.steps.filter((step) => step.status === "running");
  const latestStep = params.steps[params.steps.length - 1];
  const activePhase = running.length
    ? running[running.length - 1]?.phase
    : latestStep?.phase;

  return {
    toolStatus,
    activePhase,
    travelAgentMode: params.travelAgentMode,
    hasPreferenceConfirmation: params.hasPreferenceConfirmation,
    isStructuredPlanning: params.isStructuredPlanning,
  };
}
