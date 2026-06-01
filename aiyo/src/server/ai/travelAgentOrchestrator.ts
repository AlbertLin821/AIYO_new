import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { isPersonalMemoryRecallIntent } from "@/server/memory/personalMemoryRecall";
import { decideSearchIntent } from "@/server/search/searchIntent";
import {
  formatPreferenceSummary,
  hasMeaningfulReusablePreferences,
} from "@/lib/personalization/preferenceDisplay";
import { extractDestinationFromPlanningText } from "@/lib/tripPlanningSignals";
import type {
  ChatContext,
  ConversationMode,
  TravelAgentDecision,
  TravelAgentKnownPreferences,
  TravelPace,
  TripProfile,
} from "@/types";

type TravelAgentOrchestratorInput = {
  message: string;
  context?: ChatContext;
  tripProfile?: TripProfile;
  aiContext?: AIContextBuildResult | null;
  memoryContext?: string;
};

type TripRequestHints = {
  destination?: string;
  days?: number;
  budgetLevel?: TravelAgentKnownPreferences["budgetLevel"];
  pace?: TravelPace;
};

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function chineseNumberToInt(value: string): number | undefined {
  const normalized = value.replace(/[兩两]/g, "二");
  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }
  const digits: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === "十") {
    return 10;
  }
  const tenIndex = normalized.indexOf("十");
  if (tenIndex >= 0) {
    const tens = tenIndex === 0 ? 1 : digits[normalized[tenIndex - 1] || ""] || 0;
    const ones = digits[normalized[tenIndex + 1] || ""] || 0;
    const result = tens * 10 + ones;
    return result > 0 ? result : undefined;
  }
  return digits[normalized];
}

function extractTripRequestHints(message: string): TripRequestHints {
  const hints: TripRequestHints = {};
  const destinationMatch = message.match(/(?:想去|我要去|我想去|去|規劃|安排)\s*([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z\s]{0,18}?)(?:玩|旅遊|旅行|自由行|行程|[\d一二兩两三四五六七八九十]+\s*(?:天|日))/u);
  if (destinationMatch?.[1]) {
    hints.destination = destinationMatch[1].replace(/幫我|請|想|要|一趟|的$/g, "").trim();
  }

  const daysMatch = message.match(/([\d一二兩两三四五六七八九十]+)\s*(?:天|日)(?:\s*[\d一二兩两三四五六七八九十]+\s*夜)?/u);
  if (daysMatch?.[1]) {
    hints.days = chineseNumberToInt(daysMatch[1]);
  }

  const catalogDestination = extractDestinationFromPlanningText(message);
  if (catalogDestination) {
    hints.destination = catalogDestination;
  }

  if (/高預算|豪華|奢華|預算高|住好一點|吃好一點/u.test(message)) {
    hints.budgetLevel = "high";
  } else if (/低預算|省錢|便宜|小資|預算低/u.test(message)) {
    hints.budgetLevel = "low";
  } else if (/中預算|中等預算|中等|中價位/u.test(message)) {
    hints.budgetLevel = "medium";
  }

  if (/輕鬆|慢慢|不要太趕|放鬆/u.test(message)) {
    hints.pace = "relaxed";
  } else if (/排滿|緊湊|多一點|充實/u.test(message)) {
    hints.pace = "intensive";
  } else if (/適中|一般步調/u.test(message)) {
    hints.pace = "moderate";
  }

  return hints;
}

function hasMeaningfulPreferences(preferences?: TravelAgentKnownPreferences): boolean {
  return hasMeaningfulReusablePreferences(preferences);
}

function mergeKnownPreferences(input: TravelAgentOrchestratorInput): TravelAgentKnownPreferences {
  const structuredPreferences = input.aiContext?.structuredContext.preferences;
  const aiPreferences = input.aiContext?.structured.preferences || {};
  const normalizedStructuredPreferences: TravelAgentKnownPreferences = structuredPreferences
    ? {
        destination: structuredPreferences.destinationPreferences?.[0],
        budgetLevel: structuredPreferences.budgetLevel,
        travelStyle: structuredPreferences.travelStyles,
        travelStyles: structuredPreferences.travelStyles,
        pace: structuredPreferences.pace,
        transportPreference: structuredPreferences.transportPreference || undefined,
        accommodationPreference: structuredPreferences.accommodationPreference || undefined,
        avoid: structuredPreferences.avoidances,
        avoidances: structuredPreferences.avoidances,
        foodPreferences: structuredPreferences.foodPreferences,
        confidence: structuredPreferences.confidence,
        source: structuredPreferences.source,
        updatedAt: structuredPreferences.updatedAt,
      }
    : {};
  const mergedAiPreferences = { ...aiPreferences, ...normalizedStructuredPreferences };
  const contextPreferences = input.context?.preferences;
  const profileBudgetLevel =
    input.tripProfile?.budget === "high_end"
      ? "high"
      : input.tripProfile?.budget === "mid_range"
        ? "medium"
        : input.tripProfile?.budget === "budget"
          ? "low"
          : undefined;
  return {
    ...mergedAiPreferences,
    destination: input.context?.destination || input.tripProfile?.destination || mergedAiPreferences.destination,
    days: input.context?.days || input.tripProfile?.duration_days || mergedAiPreferences.days,
    budget: input.context?.budget || contextPreferences?.budget || mergedAiPreferences.budget,
    budgetLevel: mergedAiPreferences.budgetLevel || profileBudgetLevel,
    travelStyle: contextPreferences?.interests?.length
      ? contextPreferences.interests
      : input.tripProfile?.preferences?.length
        ? input.tripProfile.preferences
        : mergedAiPreferences.travelStyle || mergedAiPreferences.travelStyles,
    pace: contextPreferences?.pace || (input.tripProfile?.pace as TravelPace | null) || mergedAiPreferences.pace,
    transportPreference: contextPreferences?.transportPreference || input.tripProfile?.transportation || mergedAiPreferences.transportPreference,
    mustVisit: contextPreferences?.mustVisit || mergedAiPreferences.mustVisit,
    avoid: contextPreferences?.avoid || input.tripProfile?.avoid_places || mergedAiPreferences.avoid || mergedAiPreferences.avoidances,
    notes: contextPreferences?.notes || mergedAiPreferences.notes,
  };
}

function buildDecision(
  mode: ConversationMode,
  overrides: Partial<TravelAgentDecision>,
): TravelAgentDecision {
  return {
    mode,
    shouldSearch: false,
    requiredSearchProviders: [],
    shouldGenerateItinerary: mode === "generate_itinerary",
    shouldModifyItinerary: mode === "modify_itinerary",
    shouldAskFollowUp: mode === "collect_requirements" || mode === "confirm_preferences",
    missingRequirements: [],
    debugReason: "default",
    ...overrides,
  };
}

function isCasualChat(message: string): boolean {
  return /^(你好|嗨|哈囉|哈啰|hello|hi|你可以幫我做什麼|你能做什麼|可以做什麼|謝謝|感謝)[！!。.\s]*$/iu.test(message);
}

function isPreferenceAcceptance(message: string): boolean {
  return /^(沿用|可以|好|好啊|沒問題|照之前|照舊|用之前|就這樣|同意|ok|OK)(，|,|\s|。|！|!|$)/u.test(message) ||
    /照之前|沿用|照舊/u.test(message);
}

function isPreferenceRejectionOrOverride(message: string): boolean {
  return /不要|不用|這次想|這次要|改成|換成|不要沿用/u.test(message);
}

function isModifyIntent(message: string, context?: ChatContext): boolean {
  if (!context?.itinerary?.length) {
    return false;
  }
  const hasMutationVerb = /改成|換成|新增|加入|加上|加到|刪除|刪掉|移除|取消|不要了|不用了|提前|延後|移到/u.test(message);
  const mentionsCurrentPlanTarget =
    /第\s*[\d一二兩两三四五六七八九十]+\s*天|地\s*[\d一二兩两三四五六七八九十]+\s*天|最後一天|最后一天|行程/u.test(message) ||
    context.itinerary.some((day) => day.items.some((item) => item.title && message.includes(item.title)));
  if (hasMutationVerb && mentionsCurrentPlanTarget) {
    return true;
  }
  return /(?:幫我|請|把|將)?.{0,12}(?:第\s*[\d一二兩两三四五六七八九十]+\s*天|第二天|第一天|第三天|最後一天|行程).{0,30}(?:改成|換成|新增|加入|加到|刪除|刪掉|移除|取消|提前|延後|移到)|(?:改成|換成|新增|加入|加到|刪除|刪掉|移除|取消).{0,30}(?:行程|景點|餐廳|活動)/u.test(message);
}

function isMapFocusIntent(message: string): boolean {
  return /(?:地圖|地图).{0,12}(?:定位到|移到|顯示|聚焦)/u.test(message);
}

function isTripPlanningIntent(message: string): boolean {
  return /(?:想去|我要去|我想去|幫我|請|可以|能不能|想要|需要).{0,24}(?:規劃|安排|排|行程|自由行|旅遊|旅行|玩[\d一二兩两三四五六七八九十]+\s*(?:天|日))|(?:規劃|安排|排).{0,16}(?:行程|旅行|旅遊|自由行)|[\d一二兩两三四五六七八九十]+\s*(?:天|日).{0,10}(?:行程|旅行|旅遊|自由行)?/u.test(message);
}

function isGeneralTravelQuestion(message: string): boolean {
  return /適合|推薦|建議|怎麼看|好玩嗎|第一次|自由行|親子|蜜月|美食|購物|景點|地點|有哪些|查看|目前行程|交通/u.test(message);
}

function collectMissingRequirements(
  hints: TripRequestHints,
  knownPreferences: TravelAgentKnownPreferences,
): string[] {
  const missing: string[] = [];
  if (!hints.destination && !knownPreferences.destination) {
    missing.push("目的地");
  }
  if (!hints.days && !knownPreferences.days) {
    missing.push("天數");
  }
  return missing;
}

function buildFollowUpGuidance(hints: TripRequestHints, missingRequirements: string[]): string {
  const destinationPart = hints.destination ? `${hints.destination}` : "這趟旅行";
  if (missingRequirements.includes("旅客人數")) {
    return `可以，${destinationPart}${hints.days ? ` ${hints.days} 天` : ""}我先記下來。這趟幾個人一起去？`;
  }
  if (missingRequirements.includes("預算") && missingRequirements.includes("旅遊風格")) {
    return `可以，我先抓到你想安排${destinationPart}${hints.days ? ` ${hints.days} 天` : ""}。想走中等預算、較高預算，還是小資一點？另外這趟比較想偏美食購物、景點打卡，還是輕鬆散步？`;
  }
  if (missingRequirements.includes("預算")) {
    return `可以，我先抓到${destinationPart}${hints.days ? ` ${hints.days} 天` : ""}。預算想抓小資、中等，還是舒服一點的高預算？`;
  }
  if (missingRequirements.includes("旅遊風格")) {
    return `可以，${destinationPart}${hints.days ? ` ${hints.days} 天` : ""}我先記下來。這次比較想偏美食購物、景點打卡，還是輕鬆散步？`;
  }
  return `可以，我需要再確認 ${missingRequirements.slice(0, 2).join("、")}，這樣行程會比較貼近你。`;
}

export function decideTravelAgentMode(input: TravelAgentOrchestratorInput): TravelAgentDecision {
  const message = normalizeText(input.message);
  const hints = extractTripRequestHints(message);
  const knownPreferences = mergeKnownPreferences(input);
  const searchDecision = decideSearchIntent({
    message,
    context: input.context,
    preferences: knownPreferences,
  });
  const reusablePreferences = input.aiContext?.structuredContext.preferences
    ? mergeKnownPreferences({ ...input, context: undefined, tripProfile: undefined })
    : input.aiContext?.structured.preferences;
  const mergedPreferences: TravelAgentKnownPreferences = {
    ...knownPreferences,
    destination: hints.destination || knownPreferences.destination,
    days: hints.days || knownPreferences.days,
    budgetLevel: hints.budgetLevel || knownPreferences.budgetLevel,
    pace: hints.pace || knownPreferences.pace,
  };

  if (!message) {
    return buildDecision("casual_chat", {
      userFacingGuidance: "我在，想聊旅遊靈感、整理行程，或調整目前行程都可以。",
      debugReason: "empty message fallback",
    });
  }

  if (isCasualChat(message)) {
    return buildDecision("casual_chat", {
      userFacingGuidance:
        "你好，我可以幫你把旅遊想法整理成順路、好執行的行程，也能依你的偏好調整目前行程。你可以直接告訴我想去哪裡、玩幾天，或貼一個想修改的安排。",
      debugReason: "matched casual greeting/help intent",
    });
  }

  if (isPersonalMemoryRecallIntent(message)) {
    return buildDecision("answer_trip_question", {
      searchDecision: { ...searchDecision, shouldSearch: false, searchNeed: "none" },
      debugReason: "personal memory recall",
    });
  }

  if (isMapFocusIntent(message)) {
    return buildDecision("modify_itinerary", {
      searchDecision,
      debugReason: "matched map focus action intent",
    });
  }

  if (isModifyIntent(message, input.context)) {
    return buildDecision("modify_itinerary", {
      searchDecision,
      debugReason: "matched current itinerary mutation intent",
    });
  }

  if (searchDecision.shouldSearch) {
    return buildDecision("search_travel_info", {
      shouldSearch: true,
      searchReason: searchDecision.reason,
      requiredSearchProviders: searchDecision.providers,
      searchDecision,
      debugReason: `matched search intent: ${searchDecision.searchNeed}`,
    });
  }

  if (isPreferenceAcceptance(message)) {
    return buildDecision("generate_itinerary", {
      searchDecision,
      preferenceConfirmation: {
        summary: formatPreferenceSummary(mergedPreferences),
        preferences: mergedPreferences,
        prompt: "已沿用先前偏好。",
      },
      debugReason: "accepted known preferences",
    });
  }

  if (isTripPlanningIntent(message)) {
    const missingRequirements = collectMissingRequirements(hints, knownPreferences);
    if (hasMeaningfulPreferences(reusablePreferences) && !isPreferenceRejectionOrOverride(message)) {
      const reusable = reusablePreferences || {};
      const summary = formatPreferenceSummary(reusable);
      const promptDestination = hints.destination || knownPreferences.destination || "這趟";
      const dayText = hints.days || knownPreferences.days ? ` ${hints.days || knownPreferences.days} 天` : "";
      const prompt = `我找到可沿用的偏好：${summary}。這次${promptDestination}${dayText}也要沿用這些設定嗎？`;
      return buildDecision("confirm_preferences", {
        missingRequirements,
        searchDecision,
        preferenceConfirmation: {
          summary,
          preferences: mergedPreferences,
          prompt,
        },
        userFacingGuidance: `${prompt} 如果要，我可以直接幫你排；如果想改成更輕鬆或更高預算，也可以告訴我。`,
        debugReason: "planning intent with reusable known preferences",
      });
    }

    if (missingRequirements.length) {
      return buildDecision("collect_requirements", {
        missingRequirements,
        searchDecision,
        userFacingGuidance: buildFollowUpGuidance(hints, missingRequirements),
        debugReason: "planning intent missing key requirements",
      });
    }

    return buildDecision("generate_itinerary", {
      searchDecision,
      preferenceConfirmation: {
        summary: formatPreferenceSummary(mergedPreferences),
        preferences: mergedPreferences,
        prompt: "需求已足夠，可以進入行程生成。",
      },
      debugReason: "planning intent has enough requirements",
    });
  }

  if (isGeneralTravelQuestion(message)) {
    return buildDecision("answer_trip_question", {
      searchDecision,
      debugReason: "general travel question without fresh-data requirement",
    });
  }

  return buildDecision("answer_trip_question", {
    searchDecision,
    debugReason: "fallback natural chat — route to LLM",
  });
}
