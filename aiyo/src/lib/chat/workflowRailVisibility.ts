import { isPreferenceOverrideMessage } from "@/lib/personalization/preferenceDisplay";
import { isUserIdentityStatement } from "@/lib/chat/userIdentity";
import type { ChatMessage, ConversationMode } from "@/types";

const PLANNING_VERB_PATTERN =
  /(?:幫我|請|可以|能不能|想要|我要|我想|需要).{0,16}(?:規劃|安排|排|建立|創建|產生|生成|做一份|重新規劃|修改|調整)/u;

const MEMORY_RECALL_PATTERN =
  /(?:去過哪|去過哪些|去過什麼|去過甚麼|以前去|之前去|過去去|我去過|曾經去|旅行紀錄|旅遊紀錄|歷史行程|過往行程|我的記憶|記得我的|你記得|還記得|記得嗎|我是誰|我叫什麼|我的名字(?:是|叫)?什麼|我的偏好|偏好是什麼|偏好有哪些|你記住|記住我)/u;

const ITINERARY_MUTATION_PATTERN =
  /新增|加入|加上|刪除|刪掉|移除|取消|去掉|修改|調整|改成|換成|改到|提前|延後|移到|重排|重新規劃|幫我(?:安排|規劃|新增|加入|調整|修改|刪除|刪掉|移除|取消|去掉)|請(?:安排|規劃|新增|加入|調整|修改|刪除|刪掉|移除|取消|去掉)/u;

const FULL_ITINERARY_REVISION_PATTERN =
  /重新規劃|重排|整份|整個|全部|從頭|完整(?:安排|規劃)|(?:規劃|安排).{0,8}(?:新|完整|整份|全部)行程/u;

const DESTRUCTIVE_ITINERARY_PATTERN =
  /(?:第?\s*[\d一二兩两三四五六七八九十]+\s*天|day\s*\d+).{0,12}(?:全部|整天|整日)?(?:清空|刪除|刪掉|移除|取消|去掉)|(?:清空|刪除|刪掉|移除|取消|去掉).{0,12}(?:第?\s*[\d一二兩两三四五六七八九十]+\s*天|day\s*\d+)|(?:刪除|刪掉|清空).{0,12}(?:整份|整個|全部|東京|行程)|(?:整份|整個|全部).{0,12}(?:刪除|刪掉|清空|取代|替換)/iu;

const LIKELY_TRIP_WORKFLOW_PATTERN =
  /(?:幫我|請|可以|能不能|想要|我要|我想|需要).{0,12}(?:規劃|安排|建立|創建|產生|生成|做一份|排|新增|加入|加上|修改|調整|重排|重新規劃)|(?:規劃|安排|建立|產生|生成|新增|加入|修改|調整|重排|重新規劃).{0,12}(?:行程|旅行|旅遊|景點|活動|餐廳|美食)|(?:想去|我要去|我想去).{0,30}(?:旅遊|旅行|自由行|[一二兩三四五六七八九十\d]+\s*天)|(?:玩|排)[一二兩三四五六七八九十\d]+\s*天|[一二兩三四五六七八九十\d]+\s*天[一二兩三四五六七八九十\d]*\s*夜(?:行程|旅行|旅遊|自由行)?/u;

const APPLY_PREVIOUS_ITINERARY_PATTERN =
  /(?:把|將)?.{0,12}(?:這些內容|這些行程|這份|上一份|剛剛|剛才|前面|提案|建議|內容).{0,16}(?:加到|加入|新增到|套用到|寫入|放進|丟到|改到|替換到).{0,12}(?:我的|現有的)?(?:行程|右側|即時行程)|(?:套用|加入|新增|寫入|丟到|改到|替換).{0,12}(?:這份|上一份|剛剛|剛才|前面|提案|建議|內容|行程).{0,12}(?:行程|右側|即時行程)|(?:套用|加入|新增|寫入|丟到|改到|替換)(?:到)?(?:我的|現有的)?(?:行程|右側|即時行程)/u;

const PLANNING_CONFIRMATION_PATTERN =
  /^(?:讚(?:喔|哦)?|可以|好|好啊|沒問題|就這樣|同意|ok|OK|開始|開始規劃|幫我排|幫我規劃)(?:[，,。！!\s]*.*)?$/u;

const PLANNING_MODES: ReadonlySet<ConversationMode> = new Set([
  "collect_requirements",
  "confirm_preferences",
  "generate_itinerary",
]);

const NON_PLANNING_MODES: ReadonlySet<ConversationMode> = new Set([
  "casual_chat",
  "answer_trip_question",
  "modify_itinerary",
  "search_travel_info",
]);

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isCasualConversationMessage(message: string): boolean {
  return /^(你好|嗨|哈囉|哈啰|hello|hi|你可以幫我做什麼|你能做什麼|可以做什麼|謝謝|感謝)[！!。.\s]*$/iu.test(
    normalizeText(message),
  );
}

export function isPersonalMemoryRecallIntent(message: string): boolean {
  const text = normalizeText(message);
  if (!text) {
    return false;
  }
  if (PLANNING_VERB_PATTERN.test(text)) {
    return false;
  }
  return MEMORY_RECALL_PATTERN.test(text);
}

export function isConversationOnlyMessage(message: string): boolean {
  return (
    isUserIdentityStatement(message) ||
    isPersonalMemoryRecallIntent(message) ||
    isCasualConversationMessage(message)
  );
}

export function isItineraryMutationCommand(message: string): boolean {
  if (isPreferenceOverrideMessage(message)) {
    return false;
  }
  return ITINERARY_MUTATION_PATTERN.test(message);
}

export function isDestructiveItineraryCommand(message: string): boolean {
  return DESTRUCTIVE_ITINERARY_PATTERN.test(normalizeText(message));
}

export function isFullItineraryRevisionCommand(message: string): boolean {
  return FULL_ITINERARY_REVISION_PATTERN.test(message) && !isDestructiveItineraryCommand(message);
}

export function isLikelyTripWorkflowMessage(message: string): boolean {
  return LIKELY_TRIP_WORKFLOW_PATTERN.test(message);
}

export function isApplyPreviousItineraryCommand(message: string): boolean {
  return APPLY_PREVIOUS_ITINERARY_PATTERN.test(normalizeText(message));
}

export function isPlanningConfirmationCommand(message: string): boolean {
  return PLANNING_CONFIRMATION_PATTERN.test(normalizeText(message));
}

export function shouldShowPlanningWorkflowRail(input: {
  message?: string;
  travelAgentMode?: ConversationMode | null;
  responseType?: ChatMessage["responseType"];
  hasStructuredSteps?: boolean;
  inQuestionCardFlow?: boolean;
  hasPreferenceConfirmation?: boolean;
}): boolean {
  const message = input.message?.trim() ?? "";
  if (message && isConversationOnlyMessage(message)) {
    return false;
  }

  if (input.inQuestionCardFlow || input.hasPreferenceConfirmation) {
    return true;
  }

  if (input.responseType === "question_card") {
    return true;
  }

  if (input.travelAgentMode) {
    if (NON_PLANNING_MODES.has(input.travelAgentMode)) {
      return false;
    }
    if (PLANNING_MODES.has(input.travelAgentMode)) {
      return true;
    }
  }

  if (message) {
    if (isPersonalMemoryRecallIntent(message)) {
      return false;
    }

    const isFullRevision = isFullItineraryRevisionCommand(message);
    if (isFullRevision) {
      return true;
    }

    const isMutation = isItineraryMutationCommand(message);
    const isNewTripPlanning =
      isLikelyTripWorkflowMessage(message) &&
      !/(?:改|換|移|刪|移除|取消|去掉|提前|延後)/u.test(message) &&
      !/(?:第[一二三四五六七八九十\d]+天|day\s*\d+)/iu.test(message);

    if (isNewTripPlanning) {
      return true;
    }

    if (isMutation) {
      return false;
    }

    if (isLikelyTripWorkflowMessage(message)) {
      return true;
    }
  }

  if (input.hasStructuredSteps) {
    return true;
  }

  return false;
}

export function shouldAttachDecisionPreferenceConfirmation(input: {
  travelAgentMode?: ConversationMode | null;
  responseType?: ChatMessage["responseType"];
  replyPreferenceConfirmation?: ChatMessage["preferenceConfirmation"] | null;
  decisionPreferenceConfirmation?: ChatMessage["preferenceConfirmation"] | null;
}): boolean {
  return Boolean(
    input.travelAgentMode === "confirm_preferences" &&
      input.responseType !== "travel_plan" &&
      !input.replyPreferenceConfirmation &&
      input.decisionPreferenceConfirmation,
  );
}

export function shouldRenderInlinePreferenceReusePanel(input: {
  role?: ChatMessage["role"];
  isLastMessage: boolean;
  responseType?: ChatMessage["responseType"];
  hasQuestionCard?: boolean;
  messagePreferenceConfirmation?: ChatMessage["preferenceConfirmation"] | null;
  workflowRailPreferenceConfirmation?: ChatMessage["preferenceConfirmation"] | null;
  workflowRailMode?: ConversationMode | null;
}): boolean {
  if (!input.isLastMessage || input.role === "user" || input.hasQuestionCard) {
    return false;
  }

  if (input.responseType === "travel_plan") {
    return false;
  }

  if (
    input.workflowRailMode === "confirm_preferences" &&
    input.workflowRailPreferenceConfirmation
  ) {
    return true;
  }

  return Boolean(input.messagePreferenceConfirmation);
}
