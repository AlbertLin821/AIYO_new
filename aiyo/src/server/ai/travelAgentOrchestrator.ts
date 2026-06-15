import type { AIContextBuildResult } from "@/server/ai/aiContextBuilder";
import { isPersonalMemoryRecallIntent } from "@/server/memory/personalMemoryRecall";
import { decideSearchIntent } from "@/server/search/searchIntent";
import {
  formatPreferenceSummary,
  hasMeaningfulReusablePreferences,
  isPreferenceOverrideMessage,
} from "@/lib/personalization/preferenceDisplay";
import { extractUserIdentityLabel } from "@/lib/chat/userIdentity";
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
  forceStructuredRevision?: boolean;
};

type TripRequestHints = {
  destination?: string;
  days?: number;
  travelerCount?: number;
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

  const travelerCountMatch =
    message.match(/(?:總共|一共|共)\s*([一二兩两三四五六七八九十\d]+)\s*(?:個人|人)/u) ||
    message.match(/([一二兩两三四五六七八九十\d]+)\s*(?:個人|人)(?:同行|一起|出遊|旅遊|旅行|去玩)?/u);
  if (travelerCountMatch?.[1]) {
    hints.travelerCount = chineseNumberToInt(travelerCountMatch[1]);
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
  const merged: TravelAgentKnownPreferences = {
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
  if (!input.forceStructuredRevision) {
    return merged;
  }
  return {
    ...mergedAiPreferences,
    ...merged,
    destination: input.tripProfile?.destination || input.context?.destination || merged.destination,
    days: input.tripProfile?.duration_days || input.context?.days || merged.days,
    travelStyle: input.tripProfile?.preferences?.length
      ? input.tripProfile.preferences
      : merged.travelStyle,
    pace: (input.tripProfile?.pace as TravelPace | null) || merged.pace,
    transportPreference: input.tripProfile?.transportation || merged.transportPreference,
    avoid: input.tripProfile?.avoid_places?.length ? input.tripProfile.avoid_places : merged.avoid,
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

function isPreferenceAcceptance(message: string): boolean {
  return /^(讚(?:喔|哦)?(?:可以)?|沿用|可以|好|好啊|沒問題|照之前|照舊|用之前|就這樣|同意|開始|開始規劃|ok|OK)(，|,|\s|。|！|!|$)/u.test(message) ||
    /照之前|沿用|照舊/u.test(message);
}

function isPreferenceRejectionOrOverride(message: string): boolean {
  return /不要|不用|這次想|這次要|改成|換成|不要沿用/u.test(message);
}

function isTripDurationExtensionIntent(message: string, context?: ChatContext): boolean {
  if (!context?.destination && !context?.days && !context?.itinerary?.length) {
    return false;
  }
  return /(?:再)?(?:多加|增加|加|延長|延伸)\s*(?:\d+|[一二兩两三四五六七八九十])?\s*天|(?:多|加)(?:一|1)\s*天/u.test(message);
}

function isTripDurationReductionIntent(message: string, context?: ChatContext): boolean {
  if (!context?.destination && !context?.days && !context?.itinerary?.length) {
    return false;
  }
  return /(?:少|減少|减少|縮短|缩短)\s*(?:\d+|[一二兩两三四五六七八九十])?\s*天|(?:少|減)(?:一|1)\s*天/u.test(message);
}

function isModifyIntent(message: string, context?: ChatContext): boolean {
  if (isTripDurationExtensionIntent(message, context) || isTripDurationReductionIntent(message, context)) {
    return true;
  }
  if (!context?.itinerary?.length) {
    return false;
  }
  const hasMutationVerb = /改成|改到|改為|換成|調整到|新增|加入|加上|加到|加(?:一個|個)?|刪除|刪掉|移除|取消|不要了|不用了|提前|延後|移到/u.test(message);
  const mentionsCurrentPlanTarget =
    /第\s*[\d一二兩两三四五六七八九十]+\s*天|地\s*[\d一二兩两三四五六七八九十]+\s*天|最後一天|最后一天|行程/u.test(message) ||
    context.itinerary.some((day) => day.items.some((item) => item.title && message.includes(item.title)));
  if (hasMutationVerb && mentionsCurrentPlanTarget) {
    return true;
  }
  return /(?:幫我|請|把|將)?.{0,12}(?:第\s*[\d一二兩两三四五六七八九十]+\s*天|第二天|第一天|第三天|最後一天|行程).{0,30}(?:改成|改到|改為|換成|調整到|新增|加入|加到|刪除|刪掉|移除|取消|提前|延後|移到)|(?:改成|改到|改為|換成|調整到|新增|加入|加到|刪除|刪掉|移除|取消).{0,30}(?:行程|景點|餐廳|活動|時間|交通)/u.test(message);
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

function hasKnownTravelDates(input: TravelAgentOrchestratorInput): boolean {
  return Boolean(
    input.tripProfile?.travel_dates?.start?.trim() ||
      input.tripProfile?.travel_dates?.end?.trim() ||
      input.context?.tripStartDate?.trim() ||
      input.context?.tripEndDate?.trim(),
  );
}

function hasKnownTravelerCount(input: TravelAgentOrchestratorInput): boolean {
  return Boolean(
    (typeof input.tripProfile?.traveler_count === "number" && input.tripProfile.traveler_count > 0) ||
      input.tripProfile?.companions,
  );
}

function hasKnownDietaryPreferences(
  input: TravelAgentOrchestratorInput,
  knownPreferences: TravelAgentKnownPreferences,
): boolean {
  return Boolean(
    input.tripProfile?.dietary_restrictions?.length ||
      knownPreferences.foodPreferences?.length ||
      /\b(?:無特殊飲食限制|沒有飲食限制|都可以吃)\b/u.test(knownPreferences.notes || ""),
  );
}

function collectMissingRequirements(
  input: TravelAgentOrchestratorInput,
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
  if (!hasKnownTravelDates(input)) {
    missing.push("出發日期");
  }
  if (!hasKnownTravelerCount(input) && !hints.travelerCount) {
    missing.push("旅客人數");
  }
  if (!hasKnownDietaryPreferences(input, knownPreferences)) {
    missing.push("飲食偏好");
  }
  return missing;
}

function buildFollowUpGuidance(hints: TripRequestHints, missingRequirements: string[]): string {
  const destinationPart = hints.destination ? `${hints.destination}` : "這趟旅行";
  const dayText = hints.days ? ` ${hints.days} 天` : "";
  const labels = missingRequirements.filter((item) =>
    ["出發日期", "旅客人數", "飲食偏好"].includes(item),
  );
  if (labels.length) {
    return `可以，我先抓到你想安排${destinationPart}${dayText}。現在還差${labels.join("、")}，補完後我就直接幫你排完整行程。`;
  }
  return `可以，我需要再確認 ${missingRequirements.slice(0, 2).join("、")}，這樣行程會比較貼近你。`;
}

function hasExistingItinerary(context?: ChatContext): boolean {
  return Boolean(context?.itinerary?.some((day) => (day.items?.length || 0) > 0));
}

function buildRevisionFollowUpGuidance(input: {
  tripProfile?: TripProfile;
  context?: ChatContext;
  missingRequirements: string[];
}): string {
  const destination =
    input.tripProfile?.destination?.trim() || input.context?.destination?.trim() || "這趟旅程";
  const days =
    input.tripProfile?.duration_days ||
    (typeof input.context?.days === "number" && input.context.days > 0 ? input.context.days : undefined);
  const labels = input.missingRequirements.filter((item) =>
    ["出發日期", "旅客人數", "飲食偏好"].includes(item),
  );
  const tripLabel = days ? `${destination} ${days} 天行程` : `${destination}行程`;
  if (labels.length) {
    return `我會依目前這份${tripLabel}重新安排，現在只差${labels.join("、")}，補完後我就直接幫你重排完整行程。`;
  }
  return `我會依目前這份${tripLabel}重新安排，接下來直接幫你重排完整行程。`;
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
  const forcedRevision = Boolean(input.forceStructuredRevision && hasExistingItinerary(input.context));

  if (!message) {
    return buildDecision("casual_chat", {
      userFacingGuidance: "我在，想聊旅遊靈感、整理行程，或調整目前行程都可以。",
      debugReason: "empty message fallback",
    });
  }

  const identityLabel = extractUserIdentityLabel(message);
  if (identityLabel) {
    return buildDecision("casual_chat", {
      userFacingGuidance: `嗨，${identityLabel}，我記住了。你可以直接跟我聊天，也可以在想排旅程時告訴我目的地、天數和偏好。`,
      debugReason: "matched user self-identification",
    });
  }

  if (/^(你好|嗨|哈囉|哈啰|hello|hi|你可以幫我做什麼|你能做什麼|可以做什麼|謝謝|感謝)[！!。.\s]*$/iu.test(message)) {
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

  if (isPreferenceOverrideMessage(message)) {
    if (/^這次想重新填寫偏好/u.test(message)) {
      return buildDecision("collect_requirements", {
        missingRequirements: collectMissingRequirements(input, hints, knownPreferences),
        searchDecision,
        userFacingGuidance: buildFollowUpGuidance(hints, collectMissingRequirements(input, hints, knownPreferences)),
        debugReason: "preference reuse panel reset",
      });
    }
    const overrideHints = extractTripRequestHints(message);
    const overriddenPreferences: TravelAgentKnownPreferences = {
      ...mergedPreferences,
      budgetLevel: overrideHints.budgetLevel || mergedPreferences.budgetLevel,
      pace: overrideHints.pace || mergedPreferences.pace,
    };
    const destinationLabel = hints.destination || knownPreferences.destination || "這趟";
    const summary = formatPreferenceSummary(overriddenPreferences);
    return buildDecision("generate_itinerary", {
      searchDecision,
      shouldGenerateItinerary: true,
      preferenceConfirmation: {
        summary,
        preferences: overriddenPreferences,
        prompt: "已套用你修改後的偏好。",
      },
      userFacingGuidance: `好的，我會依你調整後的偏好（${summary}）來規劃${destinationLabel}行程。`,
      debugReason: "preference reuse panel override submit",
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
    if (forcedRevision) {
      const missingRequirements = collectMissingRequirements(input, hints, knownPreferences);
      if (missingRequirements.length) {
        return buildDecision("collect_requirements", {
          missingRequirements,
          searchDecision,
          userFacingGuidance: buildRevisionFollowUpGuidance({
            tripProfile: input.tripProfile,
            context: input.context,
            missingRequirements,
          }),
          debugReason: "accepted revision context but missing key requirements",
        });
      }
    }
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
    const missingRequirements = collectMissingRequirements(input, hints, knownPreferences);
    if (forcedRevision) {
      if (missingRequirements.length) {
        return buildDecision("collect_requirements", {
          missingRequirements,
          searchDecision,
          userFacingGuidance: buildRevisionFollowUpGuidance({
            tripProfile: input.tripProfile,
            context: input.context,
            missingRequirements,
          }),
          debugReason: "forced revision missing key requirements",
        });
      }
      return buildDecision("generate_itinerary", {
        searchDecision,
        preferenceConfirmation: {
          summary: formatPreferenceSummary(mergedPreferences),
          preferences: mergedPreferences,
          prompt: "需求已足夠，可以重新生成目前行程。",
        },
        userFacingGuidance: buildRevisionFollowUpGuidance({
          tripProfile: input.tripProfile,
          context: input.context,
          missingRequirements: [],
        }),
        debugReason: "forced revision has enough requirements",
      });
    }
    if (hasMeaningfulPreferences(reusablePreferences) && !isPreferenceRejectionOrOverride(message)) {
      const reusable = reusablePreferences || {};
      const summary = formatPreferenceSummary(reusable);
      const promptDestination = hints.destination || knownPreferences.destination || "這趟";
      const dayText = hints.days || knownPreferences.days ? ` ${hints.days || knownPreferences.days} 天` : "";
      const prompt = `我找到您的偏好：${summary}。這次${promptDestination}${dayText}也要使用這些設定嗎？`;
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
