"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { m } from "@/lib/motion";
import {
  ArrowUp,
  CalendarDays,
  ChevronDown,
  DollarSign,
  Heart,
  Loader2,
  MapPin,
  Mic,
  Plus,
  Square,
} from "lucide-react";
import ChatHistorySidebar from "@/components/chat/ChatHistorySidebar";
import ChatWorkflowRail from "@/components/chat/ChatWorkflowRail";
import PlanningWaitGame from "@/components/chat/PlanningWaitGame";
import PreferenceReusePanel from "@/components/chat/PreferenceReusePanel";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import QuestionCard from "@/components/chat/QuestionCard";
import { answersRecordFromPayload } from "@/components/chat/questionCardUtils";
import TravelPlanCard from "@/components/chat/TravelPlanCard";
import { CitationList } from "@/components/sources/CitationList";
import { SourceDrawer } from "@/components/sources/SourceDrawer";
import VideoCard from "@/components/home/VideoCard";
import { Card, CardContent } from "@/components/ui/card";
import { zhTW as t } from "@/locales/zh-TW";
import {
  collectVideoIdentityIds,
  fetchReplacementVideo,
} from "@/lib/replaceDismissedVideo";
import {
  dedupeVideoRecommendations,
  INITIAL_VIDEO_RECOMMENDATIONS_LIMIT,
  limitInitialVideoRecommendations,
} from "@/lib/videoListLimits";
import {
  applyPlanningUpdateToStores,
  derivePlanningSnapshot,
  extractIsoDateRangeFromText,
  extractPlanningUpdateFromText,
} from "@/lib/planningContext";
import {
  failFrontendDebugProcess,
  finishFrontendDebugProcess,
  logFrontendDebugEvent,
  startFrontendDebugProcess,
  updateFrontendDebugProcess,
} from "@/lib/frontendDebug";
import { buildWorkflowSteps } from "@/lib/workflowSteps";
import {
  buildItineraryItemFromAiChange,
  findItineraryItemTarget,
} from "@/app/chat/itineraryPatchUtils";
import { applyAssistantActions } from "@/lib/assistantActions/applyAssistantActions";
import {
  travelPlanResponseToTripPlanResult,
  tripPlanHasItems,
} from "@/lib/travelPlanConversion";
import { CHAT_HISTORY_WINDOW } from "@/lib/chatConstants";
import { isStructuredTripPlanningRequest } from "@/lib/chat/isStructuredTripPlanningRequest";
import {
  isApplyPreviousItineraryCommand,
  isFullItineraryRevisionCommand,
  isItineraryMutationCommand,
  isPlanningConfirmationCommand,
  shouldAttachDecisionPreferenceConfirmation,
  shouldRenderInlinePreferenceReusePanel,
  shouldShowPlanningWorkflowRail,
} from "@/lib/chat/workflowRailVisibility";
import { findLatestApplicableItinerarySource } from "@/lib/chat/latestItinerarySource";
import { cn } from "@/lib/utils";
import { ApiRequestError } from "@/services/apiClient";
import {
  reviseTripPlan,
  sendChatMessage,
} from "@/services/aiClient";
import { createNewTrip, setActiveTrip } from "@/services/itineraryClient";
import { geocodeItineraryItemsMissingLocation } from "@/services/geocodeItineraryItems";
import { reconcileTripMapState } from "@/services/mapSync";
import { syncService } from "@/services/syncService";
import {
  fetchVideoRecommendations,
  recordVideoWatch,
  shouldSkipClientVideoSummarize,
  summarizeVideo,
} from "@/services/videoClient";
import { useChatStore } from "@/stores/useChatStore";
import { useToastStore } from "@/stores/useToastStore";
import { useMapStore } from "@/stores/useMapStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUserStore } from "@/stores/useUserStore";
import { useVideoStore, type VideoState } from "@/stores/useVideoStore";
import type { SourceReference } from "@/lib/types/sources";
import type {
  AiProposedChange,
  ChatMessage,
  ChatResponsePayload,
  ChatQuestionAnswer,
  StatusStepPayload,
  TripPlanDay,
  TripPlanItem,
  TripPlanResult,
  TripProfile,
  TravelAgentDecision,
  TravelAgentKnownPreferences,
  TravelAgentPreferenceConfirmation,
  VideoRecommendation,
  VideoSummaryResult,
} from "@/types";

const VideoSummaryDrawer = dynamic(
  () => import("@/components/home/VideoSummaryDrawer"),
  { ssr: false },
);
const ChatContextMapView = dynamic(() => import("@/components/map/MapView"), { ssr: false });
const ChatContextItineraryPanel = dynamic(() => import("@/components/map/ItineraryPanel"), {
  ssr: false,
});

type ChatSpeechRecognitionResult = {
  isFinal: boolean;
  0: { transcript: string };
};

type ChatSpeechRecognitionEvent = {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: ChatSpeechRecognitionResult;
  };
};

type ChatSpeechRecognitionErrorEvent = {
  error?: string;
};

type ChatSpeechRecognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: ChatSpeechRecognitionEvent) => void) | null;
  onerror: ((event: ChatSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type ChatSpeechRecognitionConstructor = new () => ChatSpeechRecognition;

function buildVideoSummaryKey(input: {
  videoId?: string;
  destination?: string;
  refresh?: boolean;
}) {
  return [
    input.refresh ? "refresh" : "summary",
    input.videoId?.trim() || "unknown-video",
    input.destination?.trim() || "any-destination",
  ].join(":");
}

function videoMatches(candidate: VideoRecommendation | null, source: VideoRecommendation) {
  if (!candidate) {
    return false;
  }
  if (candidate.id === source.id) {
    return true;
  }
  return Boolean(candidate.videoId && source.videoId && candidate.videoId === source.videoId);
}

function buildUserMessage(content: string): ChatMessage {
  return {
    id: `chat_user_${Date.now()}`,
    role: "user",
    content,
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

function isAbortError(error: unknown): boolean {
  return (
    (error instanceof Error && error.name === "AbortError") ||
    (typeof DOMException !== "undefined" &&
      error instanceof DOMException &&
      error.name === "AbortError")
  );
}

function shouldRecommendVideos(message: string): boolean {
  return /影片|youtube|YouTube|video|vlog|推薦.*看|找.*看|旅遊.*看|景點.*影片|更多.*影片|再推.*影片|還有.*影片|其他.*影片|再給.*影片|多看.*影片|推薦.*更多|more.*video|another.*video/i.test(
    message,
  );
}

function getVideoIdentity(video: VideoRecommendation): string {
  return (video.videoId || video.id || "").trim();
}

function shouldFetchVideoRecommendations(input: {
  userMessage: string;
  replyResponseType?: ChatMessage["responseType"];
  hadItinerarySuggestion: boolean;
}): boolean {
  if (shouldRecommendVideos(input.userMessage)) {
    return true;
  }
  if (input.replyResponseType === "travel_plan") {
    return true;
  }
  if (input.hadItinerarySuggestion) {
    return true;
  }
  return false;
}

function buildChatVideoSearchKeyword(userMessage: string, itinerary: TripPlanDay[]): string {
  const genericLabel = /午餐|晚餐|早餐|休息|飯店入住|Check-in|交通|移動|自由行|自由活動|回程|出發|前往/i;
  const hints: string[] = [];
  const seen = new Set<string>();
  outer: for (const day of itinerary) {
    for (const item of day.items) {
      const name = item.location?.name?.trim();
      const title = item.title.trim();
      if (!title && !name) {
        continue;
      }
      const combined =
        name && title && name !== title ? `${title} ${name}`.trim() : (title || name || "").trim();
      if (!combined || genericLabel.test(combined)) {
        continue;
      }
      const key = combined.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      hints.push(combined);
      if (hints.length >= 14) {
        break outer;
      }
    }
  }
  return [userMessage.trim(), ...hints].filter(Boolean).join(" ").slice(0, 420);
}

type WorkflowRailState = {
  visible: boolean;
  steps: StatusStepPayload[];
  tripProfile: TripProfile | null;
  questionMessageId: string | null;
  preferenceConfirmation: TravelAgentPreferenceConfirmation | null;
  travelAgentMode: TravelAgentDecision["mode"] | null;
};

function workflowRailFromTravelDecision(
  decision?: TravelAgentDecision,
): Pick<WorkflowRailState, "preferenceConfirmation" | "travelAgentMode"> {
  if (decision?.mode === "confirm_preferences" && decision.preferenceConfirmation) {
    return {
      preferenceConfirmation: decision.preferenceConfirmation,
      travelAgentMode: decision.mode,
    };
  }
  return {
    preferenceConfirmation: null,
    travelAgentMode: decision?.mode ?? null,
  };
}

type ItinerarySyncState = {
  status: "idle" | "syncing" | "synced" | "failed";
  title: string;
  detail: string;
};

const CHAT_HISTORY_SIDEBAR_KEY = "aiyo:chat-history-sidebar-expanded";
const CHAT_CONTEXT_PANEL_WIDTH_KEY = "aiyo:chat-context-panel-width";
const CHAT_CONTEXT_PANEL_MIN_WIDTH = 240;
const CHAT_CONTEXT_PANEL_MAX_WIDTH = 520;

function clampContextPanelWidth(width: number): number {
  return Math.min(CHAT_CONTEXT_PANEL_MAX_WIDTH, Math.max(CHAT_CONTEXT_PANEL_MIN_WIDTH, Math.round(width)));
}

function readPositiveNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function readBudgetAmountFromText(value: string | null | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const digits = value.match(/\d[\d,]*/g);
  if (!digits?.length) {
    return undefined;
  }
  const normalized = digits.join("").replace(/,/g, "");
  return readPositiveNumber(normalized);
}

function buildTripProfileFallback(input: {
  destination?: string;
  days?: number;
  budget?: number;
  transportPreference?: string | null;
  pace?: string | null;
  interests?: string[];
}): TripProfile | null {
  if (!input.destination?.trim() && !input.days && !input.budget) {
    return null;
  }
  return {
    destination: input.destination?.trim() || null,
    duration_days: input.days ?? null,
    duration_nights: input.days ? Math.max(0, input.days - 1) : null,
    departure_location: null,
    travel_dates: null,
    companions: null,
    traveler_count: null,
    budget: input.budget ? String(input.budget) : null,
    special_population: {
      has_elderly: false,
      has_children: false,
      mobility_issue: false,
    },
    preferences: input.interests || [],
    transportation: input.transportPreference || null,
    accommodation: null,
    visited_before: [],
    avoid_places: [],
    dietary_restrictions: [],
    disliked_activities: [],
    pace: input.pace || null,
    plan_integration: "direct_merge",
  };
}

function buildTripProfileFromPreferenceConfirmation(
  confirmation: TravelAgentPreferenceConfirmation | null,
): TripProfile | null {
  const preferences = confirmation?.preferences;
  if (!preferences) {
    return null;
  }

  return buildTripProfileFromPreferenceDraft(confirmation, preferences);
}

/** Keep traveler/dates from chat; overlay budget/pace/transport from preference confirmation. */
function mergePreferenceWithExistingTripProfile(
  confirmationProfile: TripProfile | null,
  existing: TripProfile | null,
): TripProfile | undefined {
  if (!confirmationProfile && !existing) {
    return undefined;
  }
  if (!confirmationProfile) {
    return existing ?? undefined;
  }
  if (!existing) {
    return confirmationProfile;
  }
  return {
    ...existing,
    ...confirmationProfile,
    travel_dates: existing.travel_dates ?? confirmationProfile.travel_dates,
    traveler_count: existing.traveler_count ?? confirmationProfile.traveler_count,
    companions: existing.companions ?? confirmationProfile.companions,
    departure_location: existing.departure_location ?? confirmationProfile.departure_location,
  };
}

function buildTripProfileFromPreferenceDraft(
  confirmation: TravelAgentPreferenceConfirmation | null,
  draft: TravelAgentKnownPreferences,
): TripProfile | null {
  const confirmed = confirmation?.preferences;
  const destination = draft.destination || confirmed?.destination;
  const days = draft.days || confirmed?.days;
  const budget =
    draft.budgetLevel === "high"
      ? 80_000
      : draft.budgetLevel === "low"
        ? 30_000
        : draft.budgetLevel === "medium"
          ? 50_000
          : typeof draft.budget === "number"
            ? draft.budget
            : typeof confirmed?.budget === "number"
              ? confirmed.budget
              : undefined;

  return buildTripProfileFallback({
    destination,
    days,
    budget,
    transportPreference: draft.transportPreference || confirmed?.transportPreference || null,
    pace: draft.pace || confirmed?.pace || null,
    interests:
      draft.travelStyle?.length
        ? draft.travelStyle
        : draft.travelStyles?.length
          ? draft.travelStyles
          : confirmed?.travelStyle || confirmed?.travelStyles || [],
  });
}

function hasItineraryItems(days: TripPlanDay[]): boolean {
  return days.some((day) => day.items.length > 0);
}

function isConcreteItineraryMutationCommand(message: string): boolean {
  return /新增|加入|加上|刪除|刪掉|移除|取消|去掉|修改|調整|改成|換成|改到|提前|延後|移到|重排|重新規劃|第\s*[\d一二兩两三四五六七八九十]+天|day\s*\d+/iu.test(
    message,
  );
}

export default function ChatPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [input, setInput] = useState("");
  const [recommendedVideos, setRecommendedVideos] = useState<VideoRecommendation[]>([]);
  const [replacingVideoIndex, setReplacingVideoIndex] = useState<number | null>(null);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecommendation | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [historySidebarExpanded, setHistorySidebarExpanded] = useState(false);
  const [skyDashOpen, setSkyDashOpen] = useState(false);
  const [tripProfile, setTripProfile] = useState<TripProfile | null>(null);
  const [streamingStatusSteps, setStreamingStatusSteps] = useState<StatusStepPayload[]>([]);
  const [workflowRail, setWorkflowRail] = useState<WorkflowRailState>({
    visible: false,
    steps: [],
    tripProfile: null,
    questionMessageId: null,
    preferenceConfirmation: null,
    travelAgentMode: null,
  });
  const [answeredQuestionCards, setAnsweredQuestionCards] = useState<
    Record<string, ChatQuestionAnswer[]>
  >({});
  const [itinerarySyncState, setItinerarySyncState] = useState<ItinerarySyncState>({
    status: "idle",
    title: "尚未同步",
    detail: "送出需求後，這裡會顯示右側行程欄的最新同步結果。",
  });

  const [isStartingNewConversation, setIsStartingNewConversation] = useState(false);
  const [expandedContextDays, setExpandedContextDays] = useState<Record<number, boolean>>({});
  const [contextPanelWidth, setContextPanelWidth] = useState(288);
  const [autoSummaryProgress, setAutoSummaryProgress] = useState<{ current: number; total: number } | null>(null);
  const [sourceDrawerSource, setSourceDrawerSource] = useState<SourceReference | null>(null);
  const [isVoiceInputActive, setIsVoiceInputActive] = useState(false);
  const chatInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const statusStreamRef = useRef<EventSource | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const chatStoppedByUserRef = useRef(false);
  const speechRecognitionRef = useRef<ChatSpeechRecognition | null>(null);
  const speechIgnoreResultsRef = useRef(false);
  const speechBaseInputRef = useRef("");
  const speechFinalTranscriptRef = useRef("");
  const chatRequestEpochRef = useRef(0);
  const chatSendLockRef = useRef(false);
  const planningWorkflowActiveRef = useRef(false);
  const [planningWorkflowActive, setPlanningWorkflowActive] = useState(false);
  const videoSummaryQueueTokenRef = useRef(0);
  const videoSummaryInflightRef = useRef(new Map<string, Promise<VideoSummaryResult>>());
  const autoSummaryActiveRef = useRef(false);
  const conversationVideosRef = useRef<Map<string, VideoRecommendation[]>>(new Map());
  const conversationVideosLoadedMoreRef = useRef<Map<string, boolean>>(new Map());
  const hydratedConversationTripRef = useRef<string | null>(null);
  const contextTripResyncAttemptRef = useRef<string | null>(null);
  const lastTravelPlanScrollIdRef = useRef<string | null>(null);
  const [videosPanelExpanded, setVideosPanelExpanded] = useState(true);
  const {
    conversations,
    activeConversationId,
    messages,
    createConversation,
    setConversationTrip,
    selectConversation,
    deleteConversation,
    appendMessage,
    isSending,
    setIsSending,
    errorMessage,
    setErrorMessage,
    clearProposedChangesForMessage,
  } = useChatStore();
  const tripStore = useTripStore();
  const userStore = useUserStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const setSummaryDiagnostics = useVideoStore((state: VideoState) => state.setSummaryDiagnostics);
  const setIsSummarizing = useVideoStore((state: VideoState) => state.setIsSummarizing);

  useEffect(() => {
    return () => {
      speechRecognitionRef.current?.abort();
      speechRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isSending || streamingStatusSteps.length === 0 || !planningWorkflowActiveRef.current) {
      return;
    }
    setWorkflowRail((prev) => ({
      ...prev,
      visible: true,
      steps: streamingStatusSteps,
    }));
  }, [isSending, streamingStatusSteps]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (isSending) {
      return;
    }
    if (!last) {
      setWorkflowRail({
        visible: false,
        steps: [],
        tripProfile: tripProfile,
        questionMessageId: null,
        preferenceConfirmation: null,
        travelAgentMode: null,
      });
      return;
    }
    if (last.role !== "assistant") {
      return;
    }
    if (last.responseType === "question_card" && last.questionCard) {
      setWorkflowRail((prev) => ({
        visible: true,
        steps: last.statusSteps || [],
        tripProfile: last.tripProfile ?? tripProfile,
        questionMessageId: last.id,
        preferenceConfirmation:
          prev.travelAgentMode === "confirm_preferences" ? prev.preferenceConfirmation : null,
        travelAgentMode:
          prev.travelAgentMode === "confirm_preferences" ? prev.travelAgentMode : null,
      }));
      return;
    }
    if (last.responseType === "travel_plan") {
      setWorkflowRail({
        visible: false,
        steps: [],
        tripProfile: last.tripProfile ?? tripProfile,
        questionMessageId: null,
        preferenceConfirmation: null,
        travelAgentMode: null,
      });
      return;
    }
    const statusSteps = last.statusSteps;
    if (statusSteps?.length) {
      setWorkflowRail((prev) => ({
        visible: true,
        steps: statusSteps,
        tripProfile: last.tripProfile ?? tripProfile,
        questionMessageId: prev.questionMessageId,
        preferenceConfirmation:
          prev.travelAgentMode === "confirm_preferences" ? prev.preferenceConfirmation : null,
        travelAgentMode:
          prev.travelAgentMode === "confirm_preferences" ? prev.travelAgentMode : null,
      }));
      return;
    }
    setWorkflowRail((prev) => {
      if (prev.travelAgentMode === "confirm_preferences" && prev.preferenceConfirmation) {
        return {
          ...prev,
          visible: true,
          tripProfile: last.tripProfile ?? tripProfile,
        };
      }
      if (prev.visible || prev.steps.length || prev.preferenceConfirmation) {
        return {
          visible: false,
          steps: [],
          tripProfile: last.tripProfile ?? tripProfile,
          questionMessageId: null,
          preferenceConfirmation: null,
          travelAgentMode: null,
        };
      }
      return prev;
    });
  }, [activeConversationId, messages, isSending, tripProfile]);

  const tagConfigs = [
    { icon: MapPin, label: t.chat.tagDestination },
    { icon: CalendarDays, label: t.chat.tagDays },
    { icon: DollarSign, label: t.chat.tagBudget },
  ];

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (last?.responseType === "travel_plan" && last.travelPlan) {
      if (lastTravelPlanScrollIdRef.current !== last.id) {
        lastTravelPlanScrollIdRef.current = last.id;
        requestAnimationFrame(() => {
          document
            .querySelector(`[data-travel-plan-message-id="${last.id}"]`)
            ?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, errorMessage]);

  function scrollToRecommendedVideosPanel() {
    requestAnimationFrame(() => {
      document
        .querySelector('[data-testid="chat-recommended-videos"]')
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_HISTORY_SIDEBAR_KEY);
      if (raw === "false") {
        setHistorySidebarExpanded(false);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CHAT_CONTEXT_PANEL_WIDTH_KEY);
      if (raw) {
        setContextPanelWidth(clampContextPanelWidth(Number(raw)));
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace(`/login?callbackUrl=${encodeURIComponent("/chat")}`);
    }
  }, [router, status]);

  useEffect(() => () => {
    statusStreamRef.current?.close();
    videoSummaryQueueTokenRef.current += 1;
    videoSummaryInflightRef.current.clear();
  }, []);

  useEffect(() => {
    const firstDay = tripStore.itinerary[0]?.dayNumber;
    if (!firstDay) {
      setExpandedContextDays({});
      return;
    }
    setExpandedContextDays((prev) => {
      const next: Record<number, boolean> = {};
      for (const day of tripStore.itinerary) {
        next[day.dayNumber] = prev[day.dayNumber] ?? day.dayNumber === firstDay;
      }
      return next;
    });
  }, [tripStore.tripId, tripStore.itinerary]);

  const planningSnapshot = derivePlanningSnapshot({
    trip: tripStore,
    user: userStore,
  });
  const contextDestination =
    tripStore.destination.trim() ||
    tripStore.title.trim() ||
    tripProfile?.destination?.trim() ||
    (planningSnapshot.hasDestination ? planningSnapshot.destination : "");
  const activeConversation = conversations.find(
    (conversation) => conversation.id === activeConversationId,
  );
  const activeConversationTripId = activeConversation?.tripId?.trim() || "";
  const hasActiveItineraryContext = Boolean(
    activeConversationId &&
      activeConversationTripId &&
      activeConversationTripId === tripStore.tripId &&
      tripStore.tripId,
  );
  const hasContextPanel =
    (hasActiveItineraryContext || Boolean(activeConversationId && tripProfile)) &&
    (planningSnapshot.hasPlanningContext ||
      Boolean(contextDestination) ||
      Boolean(tripProfile?.duration_days) ||
      Boolean(tripProfile?.budget) ||
      tripStore.itinerary.length > 0);
  const workflowView = buildWorkflowSteps(workflowRail.steps);
  const hasWorkflowRail =
    workflowRail.visible &&
    (workflowView.length > 0 ||
      Boolean(workflowRail.preferenceConfirmation) ||
      workflowRail.travelAgentMode === "confirm_preferences");
  const activePlanningSteps =
    planningWorkflowActive && isSending && streamingStatusSteps.length > 0
      ? streamingStatusSteps
      : workflowRail.steps;
  const planningWorkflowView = buildWorkflowSteps(activePlanningSteps);
  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  const completedPlanningPhases = new Set(
    planningWorkflowView.filter((step) => step.status === "completed").map((step) => step.key),
  );
  const planningComplete =
    lastAssistantMessage?.responseType === "travel_plan" &&
    ["understand", "plan", "research", "compose"].every((phase) => completedPlanningPhases.has(phase));
  const isPlanningActive =
    (planningWorkflowActive && isSending) ||
    (hasWorkflowRail &&
      !planningComplete &&
      activePlanningSteps.some((step) => step.status === "running"));
  useEffect(() => {
    if (itinerarySyncState.status === "syncing" || itinerarySyncState.status === "failed") {
      return;
    }
    const itemCount = tripStore.itinerary.reduce((total, day) => total + day.items.length, 0);
    if (!tripStore.tripId && itemCount === 0) {
      setItinerarySyncState({
        status: "idle",
        title: "尚未同步",
        detail: "送出需求後，這裡會顯示右側行程欄的最新同步結果。",
      });
      return;
    }
    if (tripStore.tripId) {
      setItinerarySyncState({
        status: "synced",
        title: "已載入目前行程",
        detail:
          itemCount > 0
            ? `目前行程已連結，右側顯示 ${tripStore.itinerary.length} 天、${itemCount} 個活動。`
            : "目前行程已連結，尚未建立每日活動。",
      });
      return;
    }
    setItinerarySyncState({
      status: "syncing",
      title: "準備建立行程",
      detail: `已產生 ${tripStore.itinerary.length} 天、${itemCount} 個活動，正在等待同步到行程資料。`,
    });
  }, [itinerarySyncState.status, tripStore.itinerary, tripStore.tripId]);

  useEffect(() => {
    const itemCount = tripStore.itinerary.reduce((total, day) => total + day.items.length, 0);
    if (!tripStore.tripId || itemCount > 0) {
      contextTripResyncAttemptRef.current = null;
      return;
    }
    if (contextTripResyncAttemptRef.current === tripStore.tripId) {
      return;
    }
    contextTripResyncAttemptRef.current = tripStore.tripId;
    void setActiveTrip(tripStore.tripId)
      .then((snapshot) => {
        syncService.applyTripSwitch({ ...snapshot, selectConversation: false });
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      })
      .catch(() => {
        contextTripResyncAttemptRef.current = null;
      });
  }, [tripStore.itinerary, tripStore.tripId]);

  const extractedValues = [
    contextDestination || t.chat.valueUnset,
    tripStore.days > 0
      ? `${tripStore.days} ${t.chat.daysUnit}`
      : tripProfile?.duration_days
        ? `${tripProfile.duration_days} ${t.chat.daysUnit}`
      : t.chat.valueUnset,
    tripStore.budget > 0 || planningSnapshot.hasBudget
      ? `${t.chat.currencyPrefix}${(tripStore.budget || planningSnapshot.budget).toLocaleString()}`
      : tripProfile?.budget?.trim()
        ? tripProfile.budget.trim()
      : t.chat.valueUnset,
  ];

  useEffect(() => {
    const recoveredProfile =
      [...(activeConversation?.messages || messages)]
        .reverse()
        .find((message) => message.tripProfile)?.tripProfile ||
      buildTripProfileFallback({
        destination: tripStore.destination || planningSnapshot.destination,
        days: tripStore.days || planningSnapshot.days,
        budget: tripStore.budget || planningSnapshot.budget,
        transportPreference: userStore.preferredTransport || null,
        pace: userStore.travelPace || null,
        interests: userStore.interests,
      });
    if (recoveredProfile) {
      setTripProfile(recoveredProfile);
    }
  }, [
    activeConversation?.messages,
    messages,
    planningSnapshot.budget,
    planningSnapshot.days,
    planningSnapshot.destination,
    tripStore.budget,
    tripStore.days,
    tripStore.destination,
    userStore.interests,
    userStore.preferredTransport,
    userStore.travelPace,
  ]);

  useEffect(() => {
    if (!activeConversationId || !activeConversationTripId) {
      hydratedConversationTripRef.current = null;
      return;
    }
    if (activeConversationTripId === tripStore.tripId) {
      hydratedConversationTripRef.current = `${activeConversationId}:${activeConversationTripId}`;
      return;
    }
    const hydrationKey = `${activeConversationId}:${activeConversationTripId}`;
    if (hydratedConversationTripRef.current === hydrationKey) {
      return;
    }

    let cancelled = false;
    hydratedConversationTripRef.current = hydrationKey;
    void setActiveTrip(activeConversationTripId)
      .then((snapshot) => {
        if (cancelled) {
          return;
        }
        syncService.applyTripSwitch({ ...snapshot, selectConversation: false });
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          hydratedConversationTripRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeConversationId, activeConversationTripId, tripStore.tripId]);

  useEffect(() => {
    const stored = activeConversationId
      ? conversationVideosRef.current.get(activeConversationId) ?? []
      : [];
    const hasLoadedMore =
      activeConversationId != null &&
      (conversationVideosLoadedMoreRef.current.get(activeConversationId) ??
        stored.length > INITIAL_VIDEO_RECOMMENDATIONS_LIMIT);
    if (activeConversationId) {
      conversationVideosLoadedMoreRef.current.set(activeConversationId, hasLoadedMore);
    }
    setRecommendedVideos(
      hasLoadedMore ? stored : limitInitialVideoRecommendations(stored),
    );
    setVideoError(null);
    setVideosPanelExpanded(stored.length > 0);
  }, [activeConversationId]);

  function updateRecommendedVideos(
    updater: VideoRecommendation[] | ((prev: VideoRecommendation[]) => VideoRecommendation[]),
  ) {
    setRecommendedVideos((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const conversationId = useChatStore.getState().activeConversationId;
      if (conversationId) {
        conversationVideosRef.current.set(conversationId, next);
      }
      return next;
    });
  }

  function getStoredConversationVideos(conversationId: string | null): VideoRecommendation[] {
    if (!conversationId) {
      return [];
    }
    return conversationVideosRef.current.get(conversationId) ?? [];
  }
  const isCitationList = (
    sources: ChatMessage["sources"],
  ): sources is Array<{ title: string; url: string }> => Array.isArray(sources);

  function persistHistorySidebarExpanded(next: boolean) {
    setHistorySidebarExpanded(next);
    try {
      window.localStorage.setItem(CHAT_HISTORY_SIDEBAR_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  function toggleContextDay(dayNumber: number) {
    setExpandedContextDays((prev) => ({
      ...prev,
      [dayNumber]: !(prev[dayNumber] ?? false),
    }));
  }

  function stopAutoVideoSummaryQueue() {
    videoSummaryQueueTokenRef.current += 1;
    autoSummaryActiveRef.current = false;
    setAutoSummaryProgress(null);
    setIsLoadingVideos(false);
    setIsSummarizing(false);
  }

  function beginChatGenerationRequest() {
    chatRequestEpochRef.current += 1;
    const requestEpoch = chatRequestEpochRef.current;
    const previous = chatAbortControllerRef.current;
    if (previous && !previous.signal.aborted) {
      previous.abort();
    }
    const controller = new AbortController();
    chatAbortControllerRef.current = controller;
    return { requestEpoch, signal: controller.signal };
  }

  function handleStopGeneration() {
    chatStoppedByUserRef.current = true;
    chatRequestEpochRef.current += 1;
    const controller = chatAbortControllerRef.current;
    if (controller && !controller.signal.aborted) {
      controller.abort();
    }
    chatAbortControllerRef.current = null;
    stopStatusStream();
    stopAutoVideoSummaryQueue();
    setStreamingStatusSteps([]);
    setWorkflowRail((prev) => ({
      ...prev,
      visible: prev.steps.length > 0 ? prev.visible : false,
      steps: [],
    }));
    setIsSending(false);
    chatSendLockRef.current = false;
    pushToast({
      variant: "info",
      title: t.chat.generationStoppedTitle,
      description: t.chat.generationStoppedDesc,
    });
  }

  function startAutoVideoSummaryQueue(videos: VideoRecommendation[], destination: string) {
    const hasPendingSummaries = videos
      .slice(0, 6)
      .some((video) => !shouldSkipClientVideoSummarize(video));
    if (!hasPendingSummaries) {
      return false;
    }

    const queueToken = videoSummaryQueueTokenRef.current + 1;
    videoSummaryQueueTokenRef.current = queueToken;
    autoSummaryActiveRef.current = false;
    setAutoSummaryProgress(null);
    void processRecommendedVideoSummaries(videos, destination, queueToken);
    return true;
  }

  function startContextPanelResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();

    const startX = event.clientX;
    const startWidth = contextPanelWidth;
    let nextWidth = startWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const handlePointerMove = (moveEvent: PointerEvent) => {
      nextWidth = clampContextPanelWidth(startWidth + startX - moveEvent.clientX);
      setContextPanelWidth(nextWidth);
    };

    const handlePointerUp = () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      try {
        window.localStorage.setItem(CHAT_CONTEXT_PANEL_WIDTH_KEY, String(nextWidth));
      } catch {
        /* ignore */
      }
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  async function ensureTripPlanningContext(conversationTitle?: string) {
    const currentTripId = useTripStore.getState().tripId?.trim();
    const currentConversationId = useChatStore.getState().activeConversationId;
    const currentConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === currentConversationId);
    const conversationTripId = currentConversation?.tripId?.trim();

    if (currentTripId) {
      if (currentConversationId) {
        setConversationTrip(currentConversationId, currentTripId);
      }
      return currentTripId;
    }

    if (conversationTripId) {
      const snapshot = await setActiveTrip(conversationTripId);
      syncService.applyTripSwitch({ ...snapshot, selectConversation: false });
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      if (currentConversationId) {
        setConversationTrip(currentConversationId, conversationTripId);
      }
      return conversationTripId;
    }

    const created = await createNewTrip();
    const snapshot = await setActiveTrip(created.tripId);
    syncService.applyTripSwitch({ ...snapshot, selectConversation: false });
    syncService.startRealtime(snapshot.collaboration?.roomId ?? null);

    const nextConversationId = useChatStore.getState().activeConversationId;
    if (nextConversationId) {
      setConversationTrip(nextConversationId, created.tripId);
    } else {
      createConversation(conversationTitle, created.tripId);
    }
    return created.tripId;
  }

  async function ensureExistingItineraryContextLoaded(message: string) {
    const needsExistingItinerary =
      isItineraryMutationCommand(message) || isFullItineraryRevisionCommand(message);
    if (!needsExistingItinerary || useTripStore.getState().itinerary.length > 0) {
      return;
    }

    if (!syncService.isHydrated()) {
      const bootstrap = await syncService.loadBootstrap();
      syncService.applyBootstrap(bootstrap, {
        source: "chat-preflight-bootstrap",
        forceTrip: true,
      });
      syncService.startRealtime(bootstrap.collaboration?.roomId || null);
    }

    if (useTripStore.getState().itinerary.length > 0) {
      return;
    }

    const currentConversationId = useChatStore.getState().activeConversationId;
    const currentConversation = useChatStore
      .getState()
      .conversations.find((conversation) => conversation.id === currentConversationId);
    const fallbackTripId =
      useTripStore.getState().tripId?.trim() ||
      currentConversation?.tripId?.trim() ||
      activeConversationTripId;
    if (!fallbackTripId) {
      return;
    }

    const snapshot = await setActiveTrip(fallbackTripId);
    syncService.applyTripSwitch({ ...snapshot, selectConversation: false });
    syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
  }

  async function selectConversationForChat(conversationId: string) {
    const conversation = conversations.find((item) => item.id === conversationId);
    selectConversation(conversationId);
    const tripId = conversation?.tripId;
    if (!tripId || tripId === useTripStore.getState().tripId) {
      return;
    }
    try {
      const snapshot = await setActiveTrip(tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
    } catch {
      pushToast({
        variant: "warning",
        title: "無法切換對話行程",
        description: "已切換對話，但目前仍使用原本的行程脈絡。",
      });
    }
  }

  async function startConversationWithNewTrip() {
    if (isSending || isStartingNewConversation) {
      return;
    }
    setIsStartingNewConversation(true);
    try {
      const created = await createNewTrip();
      const snapshot = await setActiveTrip(created.tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      setInput("");
      setTripProfile(null);
    } catch (error) {
      pushToast({
        variant: "warning",
        title: "無法開始新對話",
        description: error instanceof Error ? error.message : "無法建立新行程。",
      });
    } finally {
      setIsStartingNewConversation(false);
    }
  }

  function stopStatusStream() {
    logFrontendDebugEvent("chat-sse", "stream-stop");
    statusStreamRef.current?.close();
    statusStreamRef.current = null;
    setStreamingStatusSteps([]);
  }

  async function startStatusStream() {
    stopStatusStream();
    const sessionId = `chat_${Date.now()}`;
    const processId = startFrontendDebugProcess("chat-sse", "監聽聊天進度 SSE", {
      sessionId,
    });
    try {
      await fetch("/api/chat/stream/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
    } catch {
      /* SSE may fail; chat still works without progress steps */
    }
    const source = new EventSource(`/api/chat/stream/${encodeURIComponent(sessionId)}`);
    source.addEventListener("status_step", (event) => {
      try {
        const step = JSON.parse((event as MessageEvent<string>).data) as StatusStepPayload;
        updateFrontendDebugProcess(processId, "status-step", {
          sessionId,
          stepLabel: step.label,
          stepStatus: step.status,
        });
        setStreamingStatusSteps((prev) => {
          const next = prev.filter(
            (item) =>
              !(
                item.phase === step.phase &&
                item.label === step.label &&
                item.provider === step.provider &&
                item.query === step.query
              ),
          );
          return [...next, step];
        });
      } catch {
        /* ignore malformed SSE payload */
      }
    });
    source.onerror = () => {
      finishFrontendDebugProcess(processId, {
        sessionId,
        reason: "eventsource-closed",
      });
      source.close();
      if (statusStreamRef.current === source) {
        statusStreamRef.current = null;
      }
    };
    statusStreamRef.current = source;
    return { sessionId, processId };
  }

  function markQuestionCardAnswered(messageId: string, answers: ChatQuestionAnswer[]) {
    setAnsweredQuestionCards((prev) => ({ ...prev, [messageId]: answers }));
  }

  function handlePreferenceAccept() {
    const confirmation = workflowRail.preferenceConfirmation;
    const confirmationProfile = buildTripProfileFromPreferenceConfirmation(confirmation);
    const destination = confirmationProfile?.destination?.trim();
    const days = confirmationProfile?.duration_days;
    const scopedInstruction = [
      "沿用先前偏好，請直接開始規劃",
      destination ? `${destination}` : "",
      days ? `${days} 天` : "",
      "完整行程。",
    ]
      .filter(Boolean)
      .join("");
    setWorkflowRail((prev) => ({
      ...prev,
      preferenceConfirmation: null,
    }));
    void handleSend(scopedInstruction, {
      displayMessage: "沿用先前偏好",
      tripProfile: mergePreferenceWithExistingTripProfile(confirmationProfile, tripProfile),
    });
  }

  function handlePreferenceDecline() {
    setWorkflowRail((prev) => ({
      ...prev,
      preferenceConfirmation: null,
    }));
    void handleSend("這次不用沿用", { displayMessage: "這次重新填寫偏好" });
  }

  function handlePreferenceEditSubmit(
    message: string,
    displayMessage: string,
    draft: TravelAgentKnownPreferences,
  ) {
    const confirmation = workflowRail.preferenceConfirmation;
    const confirmationProfile = buildTripProfileFromPreferenceDraft(confirmation, draft);
    const destination = confirmationProfile?.destination?.trim();
    const days = confirmationProfile?.duration_days;
    const scopedInstruction = [
      message,
      "請依這些偏好直接開始規劃",
      destination || "",
      days ? `${days} 天` : "",
      "完整行程。",
    ]
      .filter(Boolean)
      .join("，");
    setWorkflowRail((prev) => ({
      ...prev,
      preferenceConfirmation: null,
    }));
    void handleSend(scopedInstruction, {
      displayMessage,
      tripProfile: mergePreferenceWithExistingTripProfile(confirmationProfile, tripProfile),
    });
  }

  function handleToggleVoiceInput() {
    if (isVoiceInputActive) {
      speechIgnoreResultsRef.current = true;
      speechRecognitionRef.current?.stop();
      speechBaseInputRef.current = "";
      speechFinalTranscriptRef.current = "";
      setIsVoiceInputActive(false);
      return;
    }

    const recognitionWindow = window as Window & {
      SpeechRecognition?: ChatSpeechRecognitionConstructor;
      webkitSpeechRecognition?: ChatSpeechRecognitionConstructor;
    };
    const Recognition = recognitionWindow.SpeechRecognition ?? recognitionWindow.webkitSpeechRecognition;
    if (!Recognition) {
      pushToast({
        variant: "warning",
        title: "此瀏覽器不支援語音輸入",
        description: "請改用 Chrome 或直接輸入文字。",
      });
      return;
    }

    const recognition = new Recognition();
    const initialInput = input.trim();
    speechBaseInputRef.current = initialInput ? `${initialInput} ` : "";
    speechFinalTranscriptRef.current = "";
    speechIgnoreResultsRef.current = false;
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = recognition;
    recognition.lang = "zh-TW";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      if (speechIgnoreResultsRef.current) {
        return;
      }
      let interimTranscript = "";
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const transcript = result?.[0]?.transcript ?? "";
        if (result?.isFinal) {
          speechFinalTranscriptRef.current = `${speechFinalTranscriptRef.current}${transcript}`;
        } else {
          interimTranscript += transcript;
        }
      }
      setInput(
        `${speechBaseInputRef.current}${speechFinalTranscriptRef.current}${interimTranscript}`.trimStart(),
      );
    };
    recognition.onerror = () => {
      if (speechIgnoreResultsRef.current) {
        return;
      }
      speechIgnoreResultsRef.current = true;
      setIsVoiceInputActive(false);
      pushToast({
        variant: "warning",
        title: "語音輸入中斷",
        description: "請再試一次，或直接輸入文字。",
      });
    };
    recognition.onend = () => {
      setIsVoiceInputActive(false);
      if (speechRecognitionRef.current === recognition) {
        speechRecognitionRef.current = null;
      }
      if (speechIgnoreResultsRef.current) {
        speechBaseInputRef.current = "";
        speechFinalTranscriptRef.current = "";
      }
      chatInputRef.current?.focus();
    };

    try {
      recognition.start();
      setIsVoiceInputActive(true);
    } catch {
      speechRecognitionRef.current = null;
      setIsVoiceInputActive(false);
    }
  }

  async function fetchChatVideoRecommendations(input: {
    userMessage: string;
    planningSnapshot: ReturnType<typeof derivePlanningSnapshot>;
    chatProcessId?: string;
    append?: boolean;
    scrollAfterLoad?: boolean;
  }) {
    const conversationIdAtStart = useChatStore.getState().activeConversationId;
    const existingVideos = getStoredConversationVideos(conversationIdAtStart);
    const videoSummaryQueueToken = videoSummaryQueueTokenRef.current + 1;
    videoSummaryQueueTokenRef.current = videoSummaryQueueToken;
    autoSummaryActiveRef.current = false;
    setAutoSummaryProgress(null);
    setIsLoadingVideos(true);
    setIsSummarizing(false);
    setVideoError(null);
    setVideosPanelExpanded(true);

    let autoSummaryStarted = false;
    try {
      if (input.chatProcessId) {
        updateFrontendDebugProcess(input.chatProcessId, "video-recommendation-start", {
          destination: input.planningSnapshot.destination,
        });
      }
      const videoKeyword = buildChatVideoSearchKeyword(
        input.userMessage,
        useTripStore.getState().itinerary,
      );
      const outcome = await fetchVideoRecommendations({
        destination: input.planningSnapshot.destination,
        keyword: videoKeyword,
        days: input.planningSnapshot.days,
        preferences: useUserStore.getState().interests,
        limit: 6,
        excludeVideoIds: existingVideos.map(getVideoIdentity).filter(Boolean),
      });
      const append = input.append === true;
      const conversationIdAfterFetch = useChatStore.getState().activeConversationId;
      const cacheConversationId = conversationIdAfterFetch || conversationIdAtStart;
      if (cacheConversationId) {
        conversationVideosLoadedMoreRef.current.set(cacheConversationId, append);
      }
      const previousIds = new Set(existingVideos.map(getVideoIdentity).filter(Boolean));
      const mergedVideos = append
        ? dedupeVideoRecommendations(existingVideos, outcome.videos)
        : limitInitialVideoRecommendations(outcome.videos);
      const newlyAdded = mergedVideos.filter((video) => {
        const key = getVideoIdentity(video);
        return key && !previousIds.has(key);
      });
      if (cacheConversationId) {
        conversationVideosRef.current.set(cacheConversationId, mergedVideos);
      }
      setRecommendedVideos(mergedVideos);
      if (input.scrollAfterLoad && mergedVideos.length > 0) {
        scrollToRecommendedVideosPanel();
      }
      autoSummaryStarted = newlyAdded
        .slice(0, 6)
        .some((video) => !shouldSkipClientVideoSummarize(video));
      if (input.chatProcessId) {
        updateFrontendDebugProcess(input.chatProcessId, "video-recommendation-complete", {
          resultCount: newlyAdded.length,
          totalCount: mergedVideos.length,
          source: outcome.source,
          titles: newlyAdded.slice(0, 6).map((video) => video.title),
          autoSummaryStarted,
        });
      }
      if (autoSummaryStarted) {
        void processRecommendedVideoSummaries(
          newlyAdded,
          input.planningSnapshot.destination,
          videoSummaryQueueToken,
        );
      } else if (newlyAdded.length === 0 && existingVideos.length > 0) {
        pushToast({
          variant: "info",
          title: t.chat.noMoreVideosTitle,
          description: t.chat.noMoreVideosDesc,
        });
      }
      if (outcome.source === "mock-fallback") {
        pushToast({
          variant: "warning",
          title: t.video.mockVideosTitle,
          description: outcome.fallbackReason || t.video.mockVideosDesc,
        });
      }
    } catch (error) {
      if (input.chatProcessId) {
        failFrontendDebugProcess(input.chatProcessId, error, {
          stage: "video-recommendation",
        });
      }
      const description =
        error instanceof Error ? error.message : t.video.requestFailedGeneric;
      setVideoError(description);
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description,
      });
    } finally {
      if (!autoSummaryStarted) {
        setIsLoadingVideos(false);
      }
    }
  }

  async function handleLoadMoreVideos() {
    if (isLoadingVideos) {
      return;
    }
    const lastUserMessage =
      [...messages].reverse().find((item) => item.role === "user")?.content?.trim() || "";
    await fetchChatVideoRecommendations({
      userMessage: lastUserMessage,
      planningSnapshot,
      append: true,
    });
  }

  async function handleDismissVideo(video: VideoRecommendation, index: number) {
    const dismissedId = getVideoIdentity(video);
    if (!dismissedId || replacingVideoIndex !== null || isLoadingVideos) {
      return;
    }

    if (videoMatches(selectedVideo, video)) {
      setSelectedVideo(null);
      setSummaryDiagnostics(null);
    }

    const lastUserMessage =
      [...messages].reverse().find((item) => item.role === "user")?.content?.trim() || "";
    const videoKeyword = buildChatVideoSearchKeyword(
      lastUserMessage,
      useTripStore.getState().itinerary,
    );
    const baseRequest = {
      destination: planningSnapshot.destination,
      keyword: videoKeyword,
      days: planningSnapshot.days,
      preferences: useUserStore.getState().interests,
      limit: 1,
    };

    setReplacingVideoIndex(index);
    setVideoError(null);
    const processId = startFrontendDebugProcess("chat-video-dismiss-replace", "移除影片並補上一支推薦", {
      dismissedId,
      index,
    });

    try {
      const excludeVideoIds = collectVideoIdentityIds(recommendedVideos, [dismissedId]);
      const replacement = await fetchReplacementVideo({
        baseRequest,
        excludeVideoIds,
        mergeFromVideos: recommendedVideos,
      });

      if (replacement) {
        updateRecommendedVideos((current) => {
          if (index < 0 || index >= current.length) {
            return current;
          }
          const next = [...current];
          next[index] = replacement;
          const conversationId = useChatStore.getState().activeConversationId;
          const hasLoadedMore =
            conversationId != null &&
            (conversationVideosLoadedMoreRef.current.get(conversationId) ?? false);
          return hasLoadedMore ? next : limitInitialVideoRecommendations(next);
        });
      }

      if (replacement) {
        finishFrontendDebugProcess(processId, {
          replacementId: getVideoIdentity(replacement),
          title: replacement.title,
        });
        if (!shouldSkipClientVideoSummarize(replacement)) {
          const queueToken = videoSummaryQueueTokenRef.current + 1;
          videoSummaryQueueTokenRef.current = queueToken;
          void processRecommendedVideoSummaries(
            [replacement],
            planningSnapshot.destination,
            queueToken,
          );
        }
      } else {
        finishFrontendDebugProcess(processId, { replacementId: null });
        pushToast({
          variant: "info",
          title: t.videoCard.replaceVideoUnavailableTitle,
          description: t.videoCard.replaceVideoUnavailableDesc,
        });
      }
    } catch (error) {
      failFrontendDebugProcess(processId, error, { dismissedId, index });
      const description = error instanceof Error ? error.message : t.video.requestFailedGeneric;
      setVideoError(description);
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description,
      });
    } finally {
      setReplacingVideoIndex(null);
    }
  }

  async function handleSend(
    rawInput?: string,
    options?: {
      displayMessage?: string;
      questionAnswers?: ChatQuestionAnswer[];
      tripProfile?: TripProfile | null;
    },
  ) {
    const hasQuestionAnswers = Boolean(options?.questionAnswers?.length);
    const message = (rawInput || input).trim();
    const userTextForRetry = hasQuestionAnswers ? "" : message;
    if ((!message && !hasQuestionAnswers) || isSending || chatSendLockRef.current) {
      return;
    }

    chatSendLockRef.current = true;
    chatStoppedByUserRef.current = false;
    speechIgnoreResultsRef.current = true;
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    speechBaseInputRef.current = "";
    speechFinalTranscriptRef.current = "";
    setIsVoiceInputActive(false);

    stopAutoVideoSummaryQueue();

    await ensureExistingItineraryContextLoaded(message);

    if (!options?.questionAnswers?.length) {
      applyPlanningUpdateToStores(extractPlanningUpdateFromText(message));
    }

    const planningSnapshot = derivePlanningSnapshot({
      trip: useTripStore.getState(),
      user: useUserStore.getState(),
    });
    const dateRange = extractIsoDateRangeFromText(message);

    const previousMessages = useChatStore.getState().messages;
    const displayMessage = options?.displayMessage || message;
    const optimisticMessage = buildUserMessage(displayMessage);
    appendMessage(optimisticMessage);
    setInput("");
    setErrorMessage(null);
    setIsSending(true);
    const showPlanningRail = shouldShowPlanningWorkflowRail({
      message,
      inQuestionCardFlow: Boolean(workflowRail.questionMessageId) || hasQuestionAnswers,
      hasPreferenceConfirmation: Boolean(workflowRail.preferenceConfirmation),
    });
    planningWorkflowActiveRef.current = showPlanningRail;
    setPlanningWorkflowActive(showPlanningRail);
    setWorkflowRail((prev) => ({
      ...prev,
      visible: showPlanningRail,
      steps:
        showPlanningRail && (prev.questionMessageId || prev.preferenceConfirmation)
          ? prev.steps
          : [],
      questionMessageId: null,
      preferenceConfirmation: null,
    }));
    const chatProcessId = startFrontendDebugProcess("chat-ui", "聊天送出流程", {
      messagePreview: (message || options?.displayMessage || "").slice(0, 80),
      hasQuestionAnswers,
      hasTripProfile: Boolean(options?.tripProfile ?? tripProfile),
    });
    const { sessionId: progressSessionId, processId: sseProcessId } = await startStatusStream();
    const { requestEpoch, signal } = beginChatGenerationRequest();

    try {
      const activeProfile =
        options?.tripProfile ??
        tripProfile ??
        buildTripProfileFallback({
          destination: tripStore.destination || planningSnapshot.destination,
          days: tripStore.days || planningSnapshot.days,
          budget: tripStore.budget || planningSnapshot.budget,
          transportPreference: userStore.preferredTransport || null,
          pace: userStore.travelPace || null,
          interests: userStore.interests,
        }) ??
        undefined;
      const latestItinerarySource = findLatestApplicableItinerarySource(
        previousMessages,
      );
      if (!hasQuestionAnswers && isApplyPreviousItineraryCommand(message) && latestItinerarySource) {
        const sourceMessage = latestItinerarySource.message;
        const applyProfile: TripProfile = {
          ...(sourceMessage.tripProfile || activeProfile || {}),
          plan_integration: "direct_merge",
        } as TripProfile;
        const applyReply: ChatMessage = {
          id: `assistant_${Date.now()}`,
          role: "assistant",
          content: "已把上一份行程提案套用到右側即時行程。",
          timestamp: new Date().toLocaleTimeString("zh-TW", {
            hour: "2-digit",
            minute: "2-digit",
          }),
          responseType: "text_message",
          tripProfile: applyProfile,
        };
        appendMessage(applyReply);
        await applyItineraryUpdateFromResponse(
          {
            reply: {
              ...sourceMessage,
              tripProfile: applyProfile,
            },
            itinerarySuggestion: latestItinerarySource.plan,
            tripProfile: applyProfile,
          },
          {
            sourceMessageId: sourceMessage.id,
          },
        );
        updateFrontendDebugProcess(chatProcessId, "applied-latest-travel-plan", {
          sourceMessageId: sourceMessage.id,
          sourceKind: latestItinerarySource.plan ? "text_itinerary" : "travel_plan",
        });
        finishFrontendDebugProcess(chatProcessId, {
          progressSessionId,
          finalReplyType: "text_message",
          appliedLatestTravelPlan: true,
        });
        return;
      }
      const shouldUseTripRevisionFlow =
        !hasQuestionAnswers &&
        Boolean(activeProfile) &&
        useTripStore.getState().itinerary.length > 0 &&
        isFullItineraryRevisionCommand(message);

      if (shouldUseTripRevisionFlow && activeProfile) {
        const revisionProfile: TripProfile = {
          ...activeProfile,
          plan_integration: "direct_merge",
        };
        updateFrontendDebugProcess(chatProcessId, "trip-revision-reroute", {
          progressSessionId,
        });
        const response = await reviseTripPlan(
          {
            instruction: message,
            tripProfile: revisionProfile,
            context: {
              destination: revisionProfile.destination || planningSnapshot.destination,
              days: revisionProfile.duration_days || planningSnapshot.days,
              budget: planningSnapshot.budget,
              itinerary: useTripStore.getState().itinerary,
              tripStartDate: revisionProfile.travel_dates?.start || undefined,
              tripEndDate:
                revisionProfile.travel_dates?.end || revisionProfile.travel_dates?.start || undefined,
              preferences: {
                interests: revisionProfile.preferences,
                pace:
                  revisionProfile.pace === "relaxed" || revisionProfile.pace === "intensive"
                    ? revisionProfile.pace
                    : useUserStore.getState().travelPace || "moderate",
                transportPreference:
                  revisionProfile.transportation || useUserStore.getState().preferredTransport,
                budget: planningSnapshot.budget,
              },
            },
            progressSessionId,
          },
          { signal },
        );
        if (requestEpoch !== chatRequestEpochRef.current) {
          return;
        }
        appendMessage(response.reply);
        if (response.tripProfile) {
          setTripProfile(response.tripProfile);
        }
        await ensureTripPlanningContext(
          response.tripProfile?.destination ||
            activeConversation?.title ||
            displayMessage,
        );
        await applyItineraryUpdateFromResponse(response, {
          sourceMessageId: response.reply.id,
        });
        updateFrontendDebugProcess(chatProcessId, "reply-received", {
          replyType: response.reply.responseType,
          replyId: response.reply.id,
          tripRevisionFlow: true,
        });
        finishFrontendDebugProcess(chatProcessId, {
          progressSessionId,
          finalReplyType: response.reply.responseType,
          tripRevisionFlow: true,
        });
        return;
      }

      updateFrontendDebugProcess(chatProcessId, "request-dispatched", {
        progressSessionId,
      });
      const outgoingProfile =
        !hasQuestionAnswers && isApplyPreviousItineraryCommand(message)
          ? ({
              ...(options?.tripProfile ?? tripProfile ?? activeProfile),
              plan_integration: "direct_merge",
            } as TripProfile)
          : options?.tripProfile ?? tripProfile ?? undefined;
      const confirmedDays =
        typeof outgoingProfile?.duration_days === "number" && outgoingProfile.duration_days > 0
          ? outgoingProfile.duration_days
          : undefined;
      const isPlanningConfirmation =
        isPlanningConfirmationCommand(message) &&
        Boolean(
          workflowRail.visible ||
            workflowRail.travelAgentMode === "collect_requirements" ||
            workflowRail.travelAgentMode === "confirm_preferences" ||
            outgoingProfile?.destination ||
            planningSnapshot.destination,
        );
      const currentItineraryHasItems = hasItineraryItems(useTripStore.getState().itinerary);
      const shouldTreatAsStructuredMutation =
        isItineraryMutationCommand(message) &&
        (currentItineraryHasItems || isConcreteItineraryMutationCommand(message)) &&
        !(!currentItineraryHasItems && isFullItineraryRevisionCommand(message));
      const shouldUseStructuredPlanning =
        Boolean(options?.questionAnswers?.length) ||
        Boolean(options?.tripProfile) ||
        Boolean(workflowRail.questionMessageId) ||
        isApplyPreviousItineraryCommand(message) ||
        isStructuredTripPlanningRequest(message) ||
        isPlanningConfirmation ||
        shouldTreatAsStructuredMutation ||
        (currentItineraryHasItems && isFullItineraryRevisionCommand(message));
      const response = await sendChatMessage(
        {
          message,
          displayMessage: options?.displayMessage,
          messages: previousMessages.slice(-CHAT_HISTORY_WINDOW),
          context: {
            destination: planningSnapshot.destination,
            days: confirmedDays,
            budget: planningSnapshot.budget,
            itinerary: useTripStore.getState().itinerary,
            tripStartDate: dateRange.tripStartDate,
            tripEndDate: dateRange.tripEndDate,
            preferences: {
              interests: useUserStore.getState().interests,
              pace: useUserStore.getState().travelPace || "moderate",
              transportPreference: useUserStore.getState().preferredTransport,
              budget: planningSnapshot.budget,
            },
          },
          structuredTravelPlanning: shouldUseStructuredPlanning,
          tripProfile: outgoingProfile,
          questionAnswers: options?.questionAnswers,
          progressSessionId,
        },
        { signal },
      );
      if (requestEpoch !== chatRequestEpochRef.current) {
        return;
      }
      const decisionPreferenceConfirmation = response.travelAgentDecision?.preferenceConfirmation;
      const replyWithPreferenceConfirmation: ChatMessage =
        shouldAttachDecisionPreferenceConfirmation({
          travelAgentMode: response.travelAgentDecision?.mode ?? null,
          responseType: response.reply.responseType,
          replyPreferenceConfirmation: response.reply.preferenceConfirmation,
          decisionPreferenceConfirmation,
        })
          ? {
              ...response.reply,
              preferenceConfirmation: decisionPreferenceConfirmation,
            }
          : response.reply;
      appendMessage(replyWithPreferenceConfirmation);
      if (response.tripProfile) {
        setTripProfile(response.tripProfile);
      }
      if (response.reply.responseType === "question_card" && response.reply.questionCard) {
        const followUpSteps =
          response.reply.statusSteps?.length
            ? response.reply.statusSteps
            : streamingStatusSteps.length
              ? streamingStatusSteps
              : [
                  {
                    type: "status_step" as const,
                    phase: "understand" as const,
                    label: "等你補充偏好",
                    detail: "請在下方選擇或填寫，我會接著規劃。",
                    status: "waiting_input" as const,
                  },
                ];
        setWorkflowRail({
          visible: true,
          steps: followUpSteps,
          tripProfile: response.tripProfile ?? options?.tripProfile ?? tripProfile ?? null,
          questionMessageId: response.reply.id,
          ...workflowRailFromTravelDecision(response.travelAgentDecision),
        });
      } else if (response.reply.responseType === "travel_plan") {
        setWorkflowRail({
          visible: false,
          steps: [],
          tripProfile: response.tripProfile ?? options?.tripProfile ?? tripProfile ?? null,
          questionMessageId: null,
          preferenceConfirmation: null,
          travelAgentMode: response.travelAgentDecision?.mode ?? null,
        });
      } else if (response.reply.statusSteps?.length) {
        setWorkflowRail((prev) => ({
          visible: true,
          steps: response.reply.statusSteps || prev.steps,
          tripProfile: response.tripProfile ?? prev.tripProfile,
          questionMessageId: null,
          ...workflowRailFromTravelDecision(response.travelAgentDecision),
        }));
      } else if (response.travelAgentDecision?.mode === "confirm_preferences") {
        setWorkflowRail((prev) => ({
          ...prev,
          visible: true,
          ...workflowRailFromTravelDecision(response.travelAgentDecision),
        }));
      } else if (
        !shouldShowPlanningWorkflowRail({
          travelAgentMode: response.travelAgentDecision?.mode ?? null,
          responseType: response.reply.responseType,
          hasStructuredSteps: Boolean(response.reply.statusSteps?.length),
        })
      ) {
        setWorkflowRail({
          visible: false,
          steps: [],
          tripProfile: response.tripProfile ?? options?.tripProfile ?? tripProfile ?? null,
          questionMessageId: null,
          preferenceConfirmation: null,
          travelAgentMode: response.travelAgentDecision?.mode ?? null,
        });
      }
      const shouldPersistPlanningResult =
        Boolean(response.itinerarySuggestion) ||
        Boolean(
          (response.proposedChanges?.length || response.assistantActions?.length) &&
            response.reply.responseType !== "question_card",
        );
      if (shouldPersistPlanningResult && response.tripProfile?.plan_integration !== "self_merge") {
        await ensureTripPlanningContext(
          response.tripProfile?.destination ||
            activeConversation?.title ||
            displayMessage,
        );
      }
      const shouldDirectMergeGeneratedPlan =
        response.reply.responseType === "travel_plan" &&
        response.tripProfile?.plan_integration !== "self_merge";
      const shouldApplyGeneratedPlan =
        shouldDirectMergeGeneratedPlan &&
        Boolean(response.itinerarySuggestion || response.reply.travelPlan);
      const hasApplicableProposedChanges = Boolean(
        response.proposedChanges?.length && response.reply.responseType !== "question_card",
      );
      const shouldApplyItineraryUpdate =
        Boolean(
          shouldApplyGeneratedPlan ||
            hasApplicableProposedChanges ||
            response.assistantActions?.length ||
            isItineraryMutationCommand(message) ||
            (isApplyPreviousItineraryCommand(message) && response.tripProfile?.plan_integration !== "self_merge"),
        );
      if (shouldApplyItineraryUpdate) {
        await applyItineraryUpdateFromResponse(response, {
          sourceMessageId: response.reply.id,
        });
      } else if (
        response.reply.responseType === "travel_plan" &&
        response.tripProfile?.plan_integration === "self_merge"
      ) {
        pushToast({
          variant: "info",
          title: "已保留為建議行程",
          description: "你選擇了自行加入，所以目前只顯示建議內容，尚未直接修改現有行程。",
        });
      }
      updateFrontendDebugProcess(chatProcessId, "reply-received", {
        replyType: response.reply.responseType,
        replyId: response.reply.id,
      });

      if (shouldFetchVideoRecommendations({
        userMessage: message,
        replyResponseType: response.reply.responseType,
        hadItinerarySuggestion: Boolean(response.itinerarySuggestion),
      })) {
        const scrollAfterLoad =
          response.reply.responseType === "travel_plan" ||
          Boolean(response.itinerarySuggestion);
        await fetchChatVideoRecommendations({
          userMessage: message,
          planningSnapshot,
          chatProcessId,
          scrollAfterLoad,
        });
      } else {
        startAutoVideoSummaryQueue(recommendedVideos, planningSnapshot.destination);
      }
      finishFrontendDebugProcess(chatProcessId, {
        progressSessionId,
        finalReplyType: response.reply.responseType,
      });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        const superseded = requestEpoch !== chatRequestEpochRef.current;
        if (superseded || chatStoppedByUserRef.current) {
          useChatStore.getState().removeMessageById(optimisticMessage.id);
        }
        chatStoppedByUserRef.current = false;
        return;
      }
      failFrontendDebugProcess(chatProcessId, error, {
        progressSessionId,
      });
      setStreamingStatusSteps([]);
      setWorkflowRail((prev) => ({
        ...prev,
        steps: [],
        visible: prev.steps.length > 0,
      }));
      if (userTextForRetry) {
        setInput(userTextForRetry);
      } else if (options?.displayMessage) {
        setInput(options.displayMessage);
      }
      const description =
        error instanceof ApiRequestError && error.code === "ollama_error"
          ? t.chat.ollamaLoadingError
          : error instanceof Error
            ? error.message
            : t.chat.requestFailedGeneric;
      setErrorMessage(description);
      const retryOptions = options;
      pushToast({
        variant: "error",
        title: t.chat.requestFailed,
        description,
        actionLabel: t.common.retry,
        action: () => void handleSend(rawInput ?? userTextForRetry, retryOptions),
      });
    } finally {
      finishFrontendDebugProcess(sseProcessId, {
        progressSessionId,
        reason: "handleSend-finally",
      });
      chatSendLockRef.current = false;
      if (requestEpoch === chatRequestEpochRef.current) {
        if (chatAbortControllerRef.current?.signal === signal) {
          chatAbortControllerRef.current = null;
        }
        stopStatusStream();
        setStreamingStatusSteps([]);
        planningWorkflowActiveRef.current = false;
        setPlanningWorkflowActive(false);
        setIsSending(false);
      }
    }
  }

  async function handleRevisePlan(
    instruction: string,
    baseTripProfile?: TripProfile | null,
  ) {
    const activeProfile =
      baseTripProfile ||
      tripProfile ||
      buildTripProfileFallback({
        destination: tripStore.destination || planningSnapshot.destination,
        days: tripStore.days || planningSnapshot.days,
        budget: tripStore.budget || planningSnapshot.budget,
        transportPreference: userStore.preferredTransport || null,
        pace: userStore.travelPace || null,
        interests: userStore.interests,
      });
    if (!activeProfile || isSending) {
      return;
    }
    const revisionProfile: TripProfile = {
      ...activeProfile,
      plan_integration: "direct_merge",
    };

    appendMessage(buildUserMessage(`請幫我把行程調整成：${instruction}`));
    setErrorMessage(null);
    setIsSending(true);
    planningWorkflowActiveRef.current = false;
    setPlanningWorkflowActive(false);
    const reviseProcessId = startFrontendDebugProcess("trip-revise-ui", "前端送出行程修改", {
      instruction,
      destination: activeProfile.destination,
    });
    const { sessionId: progressSessionId, processId: sseProcessId } = await startStatusStream();
    const { requestEpoch, signal } = beginChatGenerationRequest();

    try {
      updateFrontendDebugProcess(reviseProcessId, "request-dispatched", {
        progressSessionId,
      });
      const response = await reviseTripPlan(
        {
          instruction,
          tripProfile: revisionProfile,
          context: {
            destination: revisionProfile.destination || planningSnapshot.destination,
            days: revisionProfile.duration_days || planningSnapshot.days,
            budget: planningSnapshot.budget,
            itinerary: useTripStore.getState().itinerary,
            tripStartDate: revisionProfile.travel_dates?.start || undefined,
            tripEndDate:
              revisionProfile.travel_dates?.end || revisionProfile.travel_dates?.start || undefined,
            preferences: {
              interests: revisionProfile.preferences,
              pace:
                revisionProfile.pace === "relaxed" || revisionProfile.pace === "intensive"
                  ? revisionProfile.pace
                  : useUserStore.getState().travelPace || "moderate",
              transportPreference:
                revisionProfile.transportation || useUserStore.getState().preferredTransport,
              budget: planningSnapshot.budget,
            },
          },
          progressSessionId,
        },
        { signal },
      );
      if (requestEpoch !== chatRequestEpochRef.current) {
        return;
      }
      appendMessage(response.reply);
      if (response.tripProfile) {
        setTripProfile(response.tripProfile);
      }
      await applyItineraryUpdateFromResponse(response, {
        sourceMessageId: response.reply.id,
      });
      finishFrontendDebugProcess(reviseProcessId, {
        progressSessionId,
        replyType: response.reply.responseType,
      });
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        return;
      }
      failFrontendDebugProcess(reviseProcessId, error, {
        progressSessionId,
      });
      setStreamingStatusSteps([]);
      setWorkflowRail((prev) => ({
        ...prev,
        steps: [],
        visible: prev.steps.length > 0,
      }));
      const description =
        error instanceof ApiRequestError && error.code === "ollama_error"
          ? t.chat.ollamaLoadingError
          : error instanceof Error
            ? error.message
            : t.chat.requestFailedGeneric;
      setErrorMessage(description);
      pushToast({
        variant: "error",
        title: t.chat.requestFailed,
        description,
      });
    } finally {
      finishFrontendDebugProcess(sseProcessId, {
        progressSessionId,
        reason: "handleRevisePlan-finally",
      });
      if (requestEpoch === chatRequestEpochRef.current) {
        if (chatAbortControllerRef.current?.signal === signal) {
          chatAbortControllerRef.current = null;
        }
        stopStatusStream();
        setStreamingStatusSteps([]);
        planningWorkflowActiveRef.current = false;
        setPlanningWorkflowActive(false);
        setIsSending(false);
      }
    }
  }

  async function applyAiProposedChanges(
    changes: AiProposedChange[],
    options: { navigate?: boolean; silent?: boolean; sourceMessageId?: string } = {},
  ) {
    if (!changes.length) {
      return;
    }
    setItinerarySyncState({
      status: "syncing",
      title: "正在同步行程",
      detail: `正在把 ${changes.length} 筆 AI 建議寫入右側行程欄。`,
    });
    let appliedCount = 0;
    const addedForGeocode: Array<{ dayNumber: number; item: TripPlanItem }> = [];
    const trip = useTripStore.getState();
    if (trip.itinerary.length === 0) {
      trip.addDay();
    }
    const days = useTripStore.getState().itinerary;
    const maxDay = Math.max(1, ...days.map((day) => day.dayNumber));
    for (const change of changes) {
      if (change.type === "remove_itinerary_day") {
        const targetDay = Math.max(1, Math.floor(Number(change.day) || 1));
        const itinerary = useTripStore.getState().itinerary;
        if (itinerary.length <= 1) {
          continue;
        }
        if (!itinerary.some((day) => day.dayNumber === targetDay)) {
          continue;
        }
        useTripStore.getState().removeDay(targetDay);
        appliedCount += 1;
        continue;
      }

      if (change.type === "add_itinerary_item") {
        const targetDay = Math.max(1, Math.floor(Number(change.day) || 1));
        while (!useTripStore.getState().itinerary.some((day) => day.dayNumber === targetDay)) {
          useTripStore.getState().addDay();
          if (useTripStore.getState().itinerary.length > Math.max(targetDay, maxDay + 3)) {
            break;
          }
        }
        const newItem = buildItineraryItemFromAiChange({ ...change, day: targetDay });
        useTripStore.getState().addItineraryItem(targetDay, newItem);
        addedForGeocode.push({ dayNumber: targetDay, item: newItem });
        appliedCount += 1;
        continue;
      }

      const target = findItineraryItemTarget(change);
      if (!target) {
        continue;
      }
      if (change.type === "remove_itinerary_item") {
        useTripStore.getState().removeItineraryItem(target.dayNumber, target.item.id);
        appliedCount += 1;
        continue;
      }

      const patch: Partial<TripPlanItem> = {};
      if (change.time) {
        patch.time = change.time;
      }
      if (change.title) {
        patch.title = change.title;
      }
      if (change.notes !== undefined) {
        patch.notes = change.notes;
      }
      if (change.transport !== undefined) {
        patch.transport = change.transport;
      }
      if (change.locationName) {
        if (target.item.location) {
          const currentLocationName = target.item.location.name.trim();
          const nextLocationName = change.locationName.trim();
          if (currentLocationName === nextLocationName) {
            patch.location = target.item.location;
          } else {
            patch.location = undefined;
            patch.notes = [
              patch.notes ?? target.item.notes ?? "",
              `AI 建議改為「${nextLocationName}」，但尚未取得可驗證座標，已暫不沿用原本地圖標點。`,
            ]
              .filter(Boolean)
              .join("\n");
            const mapStore = useMapStore.getState();
            mapStore.setPins(
              mapStore.pins.filter((pin) => pin.linkedTripItemId !== target.item.id),
            );
          }
        } else if (!change.notes) {
          patch.notes = [target.item.notes || "", `地點：${change.locationName}`].filter(Boolean).join("\n");
        }
      }
      if (Object.keys(patch).length > 0) {
        useTripStore.getState().updateItineraryItem(target.dayNumber, target.item.id, patch);
        appliedCount += 1;
      }
    }

    const unappliedCount = Math.max(changes.length - appliedCount, 0);

    if (addedForGeocode.length > 0) {
      const region = useTripStore.getState().destination || useUserStore.getState().destination;
      const geocodeUpdates = await geocodeItineraryItemsMissingLocation(addedForGeocode, region);
      for (const update of geocodeUpdates) {
        useTripStore.getState().updateItineraryItem(update.dayNumber, update.itemId, {
          location: update.location,
        });
      }
    }

    if (appliedCount > 0) {
      try {
        await syncService.flushTripSyncNow({ force: true });
        setItinerarySyncState({
          status: "synced",
          title: "已同步到目前行程",
          detail:
            unappliedCount > 0
              ? `已更新 ${appliedCount} 筆，另有 ${unappliedCount} 筆找不到對應項目。`
              : `已更新 ${appliedCount} 筆行程內容。`,
        });
      } catch (error) {
        setItinerarySyncState({
          status: "failed",
          title: "同步失敗",
          detail: error instanceof Error ? error.message : "無法把 AI 建議同步到目前行程。",
        });
        throw error;
      }
      if (!options.silent) {
        pushToast({
          variant: "success",
          title: "已套用 AI 建議",
          description:
            unappliedCount > 0
              ? `已更新 ${appliedCount} 筆，另有 ${unappliedCount} 筆未找到對應項目。`
              : `已更新 ${appliedCount} 筆行程內容。`,
        });
      }
      if (options.sourceMessageId) {
        clearProposedChangesForMessage(options.sourceMessageId);
      }
      if (options.navigate ?? false) {
        router.push("/itinerary");
      }
    } else if (!options.silent) {
      setItinerarySyncState({
        status: "failed",
        title: "沒有可同步的變更",
        detail: "AI 有提供修改方向，但目前行程中找不到可直接更新的對應項目。",
      });
      pushToast({
        variant: "warning",
        title: "找不到可套用的行程項目",
        description: "AI 回覆了修改建議，但目前行程中沒有找到對應項目。",
      });
    }
  }

  function resolveGeneratedTripPlan(response: ChatResponsePayload): TripPlanResult | null {
    if (response.itinerarySuggestion) {
      return response.itinerarySuggestion;
    }
    if (!response.reply.travelPlan) {
      return null;
    }
    const currentTrip = useTripStore.getState();
    const targetDayCount =
      response.tripProfile?.duration_days ??
      planningSnapshot.days ??
      currentTrip.itinerary?.length;
    return travelPlanResponseToTripPlanResult(response.reply.travelPlan, {
      targetDayCount: targetDayCount && targetDayCount > 0 ? targetDayCount : undefined,
    });
  }

  async function applyItineraryUpdateFromResponse(
    response: ChatResponsePayload,
    options: { sourceMessageId?: string; silent?: boolean } = {},
  ) {
    const shouldApplyGeneratedPlan =
      response.reply.responseType === "travel_plan" &&
      response.tripProfile?.plan_integration !== "self_merge" &&
      Boolean(response.itinerarySuggestion || response.reply.travelPlan);

    if (shouldApplyGeneratedPlan) {
      const applied = await applyGeneratedTripPlan(response, { silent: options.silent });
      if (applied) {
        return;
      }
    }

    if (response.assistantActions?.length) {
      await applyAssistantActions(response.assistantActions, { persist: true });
      return;
    }

    if (response.proposedChanges?.length) {
      // Legacy fallback only. New structured itinerary edits should arrive via assistantActions.
      await applyAiProposedChanges(response.proposedChanges, {
        navigate: false,
        sourceMessageId: options.sourceMessageId ?? response.reply.id,
      });
      return;
    }

    if (response.reply.responseType === "travel_plan") {
      pushToast({
        variant: "warning",
        title: "沒有可套用的行程變更",
        description: "AI 已回覆行程提案，但無法寫入右側每日項目。",
      });
    }
  }

  async function handleApplyTravelPlanMessage(message: ChatMessage) {
    if (!message.travelPlan) {
      return;
    }
    const applyProfile: TripProfile = {
      ...(message.tripProfile || tripProfile || {}),
      plan_integration: "direct_merge",
    } as TripProfile;
    await applyItineraryUpdateFromResponse(
      {
        reply: {
          ...message,
          tripProfile: applyProfile,
        },
        tripProfile: applyProfile,
      },
      {
        sourceMessageId: message.id,
      },
    );
  }

  async function applyGeneratedTripPlan(
    response: ChatResponsePayload,
    options: { silent?: boolean } = {},
  ) {
    const plan = resolveGeneratedTripPlan(response);
    if (!plan || !tripPlanHasItems(plan)) {
      if (response.reply.travelPlan && !options.silent) {
        setItinerarySyncState({
          status: "failed",
          title: "無法寫入即時行程",
          detail: "行程提案沒有可套用的地點或活動。",
        });
        pushToast({
          variant: "warning",
          title: "無法同步到右側行程",
          description: "AI 有行程提案，但內容無法寫入每日項目。",
        });
      }
      return false;
    }
    setItinerarySyncState({
      status: "syncing",
      title: "正在同步行程",
      detail: "AI 正在把新的每日行程寫入右側行程欄。",
    });
    const currentTrip = useTripStore.getState();
    currentTrip.replaceTripPlan(plan, {
      destination: currentTrip.destination || response.tripProfile?.destination || planningSnapshot.destination,
      days: plan.days.length,
      budget:
        currentTrip.budget ||
        planningSnapshot.budget ||
        readBudgetAmountFromText(response.tripProfile?.budget),
      title: currentTrip.title || response.tripProfile?.destination || currentTrip.destination,
    });
    const reconciled = reconcileTripMapState(useTripStore.getState().itinerary, useMapStore.getState().pins);
    useTripStore.getState().setItinerary(reconciled.itinerary);
    useMapStore.getState().setPins(reconciled.pins);
    syncService.markLocalTripPayloadAsSynced();
    await syncService.flushTripSyncNow({ force: true });
    setItinerarySyncState({
      status: "synced",
      title: "已同步到目前行程",
      detail: `已更新 ${plan.days.length} 天行程內容。`,
    });
    if (!options.silent) {
      pushToast({
        variant: "success",
        title: "已更新行程",
        description: "AI 已把修改後的行程同步到目前行程。",
      });
    }
    return true;
  }

  function applyVideoSummaryResult(sourceVideo: VideoRecommendation, result: VideoSummaryResult) {
    updateRecommendedVideos((videos) =>
      videos.map((item) => (videoMatches(item, sourceVideo) ? result.video : item)),
    );
    setSelectedVideo((current) => (videoMatches(current, sourceVideo) ? result.video : current));
  }

  function buildSummaryDiagnostics(result: VideoSummaryResult) {
    return {
      transcriptSource: result.transcriptSource,
      summarySource: result.summarySource,
      segmentSource: result.segmentSource,
      captionLanguage: result.debug?.captionLanguage,
      captionKind: result.debug?.captionKind,
      captionSource: result.debug?.captionSource,
      mapsProvenance: result.mapsProvenance,
      geocodeWarnings: result.geocodeWarnings,
      summaryUnavailable: result.summaryUnavailable,
      unavailableReason: result.unavailableReason,
      fallbackReason: result.fallbackReason,
      failedChunkCount: result.debug?.failedChunkCount,
    };
  }

  async function summarizeVideoOnce(input: {
    video: VideoRecommendation;
    destination: string;
    refresh?: boolean;
    debug?: boolean;
  }) {
    const key = buildVideoSummaryKey({
      videoId: input.video.videoId,
      destination: input.destination,
      refresh: input.refresh,
    });
    const existing = videoSummaryInflightRef.current.get(key);
    if (existing) {
      return existing;
    }
    const request = summarizeVideo({
      videoId: input.video.videoId,
      title: input.video.title,
      destination: input.destination,
      refresh: input.refresh,
      debug: input.debug,
    }).finally(() => {
      videoSummaryInflightRef.current.delete(key);
    });
    videoSummaryInflightRef.current.set(key, request);
    return request;
  }

  async function processRecommendedVideoSummaries(
    videos: VideoRecommendation[],
    destination: string,
    queueToken: number,
  ) {
    const queue = videos.slice(0, 6).filter((video) => !shouldSkipClientVideoSummarize(video));
    if (queue.length === 0) {
      return;
    }

    autoSummaryActiveRef.current = true;
    setAutoSummaryProgress({ current: 0, total: queue.length });
    setIsLoadingVideos(true);
    setIsSummarizing(true);

    try {
      for (let index = 0; index < queue.length; index += 1) {
        if (videoSummaryQueueTokenRef.current !== queueToken) {
          return;
        }
        const video = queue[index];
        setAutoSummaryProgress({ current: index + 1, total: queue.length });
        try {
          const result = await summarizeVideoOnce({
            video,
            destination,
            debug: false,
          });
          if (videoSummaryQueueTokenRef.current !== queueToken) {
            return;
          }
          applyVideoSummaryResult(video, result);
        } catch (error) {
          logFrontendDebugEvent("chat-video", "auto-summary-failed", {
            videoId: video.videoId,
            title: video.title,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      if (videoSummaryQueueTokenRef.current === queueToken) {
        autoSummaryActiveRef.current = false;
        setAutoSummaryProgress(null);
        setIsLoadingVideos(false);
        setIsSummarizing(false);
      }
    }
  }

  async function openVideoSummary(video: VideoRecommendation) {
    setSummaryDiagnostics(null);
    setSelectedVideo(video);
    if (video.videoId?.trim()) {
      void recordVideoWatch({
        videoId: video.videoId,
        videoUrl: video.url,
        title: video.title,
        currentTripId: useTripStore.getState().tripId,
      }).catch(() => undefined);
    }
    logFrontendDebugEvent("chat-video", "open-summary-click", {
      videoId: video.videoId,
      title: video.title,
      skipClientSummary: shouldSkipClientVideoSummarize(video),
    });

    if (shouldSkipClientVideoSummarize(video)) {
      return;
    }

    setIsLoadingVideos(true);
    setIsSummarizing(true);
    try {
      const result = await summarizeVideoOnce({
        video,
        destination: planningSnapshot.destination,
      });
      applyVideoSummaryResult(video, result);
      setSummaryDiagnostics(buildSummaryDiagnostics(result));
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
      });
    } finally {
      if (!autoSummaryActiveRef.current) {
        setIsLoadingVideos(false);
        setIsSummarizing(false);
      }
    }
  }

  async function refreshVideoSummary(video: VideoRecommendation) {
    if (!video.videoId?.trim()) {
      return;
    }
    setSummaryDiagnostics(null);
    setIsLoadingVideos(true);
    setIsSummarizing(true);
    logFrontendDebugEvent("chat-video", "refresh-summary-click", {
      videoId: video.videoId,
      title: video.title,
    });
    try {
      const result = await summarizeVideoOnce({
        video,
        destination: planningSnapshot.destination,
        refresh: true,
      });
      applyVideoSummaryResult(video, result);
      setSummaryDiagnostics(buildSummaryDiagnostics(result));
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
      });
    } finally {
      if (!autoSummaryActiveRef.current) {
        setIsLoadingVideos(false);
        setIsSummarizing(false);
      }
    }
  }

  function handleOpenSourceDrawer(source: SourceReference) {
    setSourceDrawerSource(source);
  }

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center p-8">
        <p className="text-sm text-muted">{t.login.suspenseFallback}</p>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return null;
  }

  return (
    <div
      className="chat-page-root relative flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 overflow-hidden bg-slate-50 lg:h-screen"
    >
      <ChatHistorySidebar
        expanded={historySidebarExpanded}
        conversations={conversations}
        activeConversationId={activeConversationId}
        userName={session?.user?.name}
        userImage={session?.user?.image}
        onExpand={() => persistHistorySidebarExpanded(true)}
        onCollapse={() => persistHistorySidebarExpanded(false)}
        onNewConversation={() => void startConversationWithNewTrip()}
        onSelectConversation={(conversationId) => void selectConversationForChat(conversationId)}
        onDeleteConversation={(conversationId) => void deleteConversation(conversationId)}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="relative z-20 overflow-visible border-b border-slate-200 bg-white/92 px-6 py-4 backdrop-blur">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="font-semibold text-slate-900">{t.chat.pageTitle}</h1>
            </div>
            <button
              type="button"
              onClick={() => void startConversationWithNewTrip()}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-900 transition-colors hover:bg-slate-50 md:hidden"
            >
              <Plus className="size-3.5" aria-hidden />
              {t.chat.newConversation}
            </button>
          </div>
        </div>
        {conversations.length > 0 && (
          <div className="relative z-10 flex gap-2 overflow-x-auto border-b border-slate-200 bg-white/88 px-4 py-3 backdrop-blur md:hidden">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => void selectConversationForChat(conversation.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  conversation.id === activeConversationId
                    ? "border-slate-900 bg-slate-900 text-white"
                    : "border-slate-200 bg-white text-slate-600"
                }`}
              >
                {conversation.title}
              </button>
            ))}
          </div>
        )}

        <div
          className="relative z-[1] flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto bg-[rgba(255,255,255,0.42)] px-6 py-6"
        >
          {hasWorkflowRail ? (
            <ChatWorkflowRail visible={hasWorkflowRail} steps={workflowRail.steps} />
          ) : null}

          {messages.length === 0 && !isSending && !errorMessage && (
            <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
              <p className="font-medium text-slate-900">{t.chat.emptyTitle}</p>
            </div>
          )}

          {messages.map((message, index) => (
            <m.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03 }}
              data-testid={message.role === "user" ? "chat-message-user" : "chat-message-ai"}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={cn(
                  "flex items-end gap-2",
                  message.responseType === "travel_plan"
                    ? "w-full max-w-4xl"
                    : "max-w-[70%]",
                  message.role === "user" ? "flex-row-reverse" : ""
                )}
              >
                <div
                  className={`flex size-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    message.role === "user"
                      ? "bg-slate-900"
                      : "bg-slate-700"
                  }`}
                >
                  {message.role === "user" ? t.chat.userShort : t.chat.aiShort}
                </div>

                <div>
                  {message.responseType === "question_card" && message.questionCard ? null : (
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        message.role === "user"
                          ? "rounded-br-md bg-slate-900 text-white"
                          : message.responseType === "travel_plan"
                            ? "rounded-bl-md bg-transparent p-0 text-foreground"
                            : "chat-assistant-surface rounded-bl-md text-slate-800"
                      }`}
                    >
                      {message.responseType === "travel_plan" && message.travelPlan ? (
                        <div
                          data-travel-plan-message-id={message.id}
                          className="max-w-full rounded-[28px] border border-slate-200/80 bg-white/95 p-4 shadow-md ring-1 ring-black/5 sm:p-5"
                        >
                          <TravelPlanCard
                            plan={message.travelPlan}
                            revisionDisabled={isSending}
                            onApply={() => void handleApplyTravelPlanMessage(message)}
                            onRevise={(instruction) => void handleRevisePlan(instruction, message.tripProfile || tripProfile)}
                            onOpenGroundedSource={handleOpenSourceDrawer}
                          />
                        </div>
                      ) : message.responseType === "status_step" ? (
                        message.content?.trim() ? (
                          <MarkdownMessage content={message.content} />
                        ) : null
                      ) : (
                        <MarkdownMessage
                          content={message.content}
                          inverted={message.role === "user"}
                        />
                      )}
                    </div>
                  )}
                  {message.role !== "user" &&
                    message.sourceReferences &&
                    message.sourceReferences.length > 0 && (
                      <div className="mt-2 max-w-[min(100%,24rem)] rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2">
                        <CitationList
                          sources={message.sourceReferences}
                          maxVisible={6}
                          onOpenSourceDetail={handleOpenSourceDrawer}
                        />
                      </div>
                    )}
                  {message.role === "assistant" && message.questionCard ? (
                    <div className="mt-3 w-full min-w-[min(100%,20rem)] max-w-md">
                      <QuestionCard
                        card={message.questionCard}
                        disabled={isSending}
                        submitted={Boolean(answeredQuestionCards[message.id])}
                        initialAnswers={
                          answeredQuestionCards[message.id]
                            ? answersRecordFromPayload(answeredQuestionCards[message.id])
                            : undefined
                        }
                        onSubmit={(answers, summary) => {
                          markQuestionCardAnswered(message.id, answers);
                          void handleSend("", {
                            displayMessage: summary,
                            questionAnswers: answers,
                            tripProfile:
                              message.tripProfile ??
                              workflowRail.tripProfile ??
                              tripProfile ??
                              undefined,
                          });
                        }}
                      />
                    </div>
                  ) : null}
                  {shouldRenderInlinePreferenceReusePanel({
                    role: message.role,
                    isLastMessage: index === messages.length - 1,
                    responseType: message.responseType,
                    hasQuestionCard: Boolean(message.questionCard),
                    messagePreferenceConfirmation: message.preferenceConfirmation,
                    workflowRailPreferenceConfirmation: workflowRail.preferenceConfirmation,
                    workflowRailMode: workflowRail.travelAgentMode,
                  }) ? (
                    <div className="mt-3 w-full min-w-[min(100%,20rem)] max-w-md">
                      <PreferenceReusePanel
                        variant="inline"
                        confirmation={
                          (workflowRail.travelAgentMode === "confirm_preferences" &&
                          workflowRail.preferenceConfirmation
                            ? workflowRail.preferenceConfirmation
                            : message.preferenceConfirmation)!
                        }
                        disabled={isSending}
                        currentDestination={tripProfile?.destination || planningSnapshot.destination}
                        currentDays={tripProfile?.duration_days || planningSnapshot.days}
                        onAccept={handlePreferenceAccept}
                        onDecline={handlePreferenceDecline}
                        onEditSubmit={handlePreferenceEditSubmit}
                      />
                    </div>
                  ) : null}
                  <p
                    className={`mt-1 text-[10px] text-muted ${
                      message.role === "user" ? "text-right" : ""
                    }`}
                  >
                    {message.timestamp}
                  </p>
                  {message.role !== "user" && isCitationList(message.sources) && message.sources.length > 0 && (
                    <div className="mt-1.5 space-y-1 text-[11px] text-muted">
                      {message.sources.slice(0, 3).map((source) => (
                        <p key={`${message.id}_${source.url}`}>
                          來源：
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-1 text-primary hover:underline"
                          >
                            {source.title}
                          </a>
                        </p>
                      ))}
                    </div>
                  )}
                  {message.role !== "user" &&
                    ((message.proposedChanges || []).length > 0 || (message.assistantActions || []).length > 0) && (
                    <button
                      type="button"
                      data-testid="chat-apply-proposed-changes"
                      onClick={() =>
                        message.assistantActions?.length
                          ? void applyAssistantActions(message.assistantActions, { persist: true })
                          : void applyAiProposedChanges(message.proposedChanges || [], { navigate: false })
                      }
                      className="mt-2 rounded-2xl border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-slate-800"
                    >
                      立即同步到右側行程
                    </button>
                  )}
                </div>
              </div>
            </m.div>
          ))}

          {isSending ? (
            <m.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              data-testid="chat-message-ai-thinking"
              className="flex justify-start"
            >
              <div className="flex max-w-[70%] items-end gap-2">
                <div className="flex size-8 flex-shrink-0 items-center justify-center rounded-full bg-slate-700 text-xs font-bold text-white">
                  {t.chat.aiShort}
                </div>
                <div className="chat-assistant-surface rounded-2xl rounded-bl-md px-4 py-3 text-sm text-slate-800">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin text-slate-500" aria-hidden />
                    <span>{t.chat.assistantTyping}</span>
                  </div>
                </div>
              </div>
            </m.div>
          ) : null}

          {errorMessage && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger backdrop-blur-sm">
              {errorMessage}
            </div>
          )}

          {(isLoadingVideos || videoError || recommendedVideos.length > 0) && (
            <section
              data-testid="chat-recommended-videos"
              className="rounded-3xl border border-slate-200/80 chat-glass-card-strong text-chat-soft shadow-sm"
            >
              <button
                type="button"
                onClick={() => setVideosPanelExpanded((expanded) => !expanded)}
                aria-expanded={videosPanelExpanded}
                aria-controls="chat-recommended-videos-panel"
                className="flex w-full items-center justify-between gap-3 rounded-3xl px-4 py-4 text-left transition-colors hover:bg-white/50"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-semibold text-chat-fg">{t.chat.recommendedVideosTitle}</h2>
                    {recommendedVideos.length > 0 ? (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
                        {t.chat.recommendedVideosCount.replace("{n}", String(recommendedVideos.length))}
                      </span>
                    ) : null}
                  </div>
                  {autoSummaryProgress && videosPanelExpanded ? (
                    <p className="mt-1 text-xs text-chat-muted">
                      正在依序處理影片資料 {autoSummaryProgress.current}/{autoSummaryProgress.total}
                    </p>
                  ) : null}
                  {!videosPanelExpanded && recommendedVideos.length > 0 ? (
                    <p className="mt-1 text-xs text-chat-muted">{t.chat.loadMoreVideosHint}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {isLoadingVideos ? <Loader2 className="size-4 animate-spin text-primary" aria-hidden /> : null}
                  <ChevronDown
                    className={cn(
                      "size-4 text-slate-500 transition-transform duration-200",
                      videosPanelExpanded && "rotate-180",
                    )}
                    aria-hidden
                  />
                  <span className="sr-only">
                    {videosPanelExpanded ? t.chat.collapseRecommendedVideos : t.chat.expandRecommendedVideos}
                  </span>
                </div>
              </button>

              {videosPanelExpanded ? (
                <div id="chat-recommended-videos-panel" className="border-t border-slate-200/70 px-4 pb-4 pt-3">
                  {videoError && (
                    <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                      {videoError}
                    </p>
                  )}
                  {recommendedVideos.length > 0 && (
                    <>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                        {recommendedVideos.map((video, index) =>
                          replacingVideoIndex === index ? (
                            <Card
                              key={`replacing-${index}`}
                              className="overflow-hidden rounded-2xl border-0 bg-surface py-0 shadow-soft ring-0"
                              data-testid="video-card-replacing"
                            >
                              <div className="relative flex aspect-video items-center justify-center bg-gradient-to-br from-foreground/5 to-foreground/10">
                                <Loader2 className="size-8 animate-spin text-primary" aria-hidden />
                                <span className="sr-only">{t.videoCard.replacingVideo}</span>
                              </div>
                              <CardContent className="p-4">
                                <p className="text-sm text-muted">{t.videoCard.replacingVideo}</p>
                              </CardContent>
                            </Card>
                          ) : (
                            <VideoCard
                              key={video.id}
                              video={video}
                              index={index}
                              onClick={() => void openVideoSummary(video)}
                              onDismiss={() => void handleDismissVideo(video, index)}
                            />
                          ),
                        )}
                      </div>
                      <div className="mt-4 flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-chat-muted">{t.chat.loadMoreVideosHint}</p>
                        <button
                          type="button"
                          data-testid="chat-load-more-videos"
                          disabled={isLoadingVideos}
                          onClick={() => void handleLoadMoreVideos()}
                          className="inline-flex items-center gap-2 rounded-2xl border border-primary/25 bg-primary/8 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/12 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isLoadingVideos ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : null}
                          {t.chat.loadMoreVideos}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : null}
            </section>
          )}
          <div ref={messagesEndRef} aria-hidden className="h-px shrink-0" />
        </div>

        <div className="relative z-10 border-t border-slate-200 bg-white/88 px-4 pb-5 pt-4 backdrop-blur sm:px-6 sm:pb-6">
          <div
            className={cn(
              "flex min-h-[58px] items-center gap-2 rounded-full border bg-white px-3 py-2 shadow-[0_12px_32px_rgba(15,23,42,0.06)] transition-all duration-200 sm:min-h-[64px] sm:gap-3 sm:px-5",
              isVoiceInputActive
                ? "border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.14),0_16px_38px_rgba(185,28,28,0.16)] ring-2 ring-red-500/30 focus-within:border-red-500 focus-within:ring-red-500/35"
                : "border-slate-200 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20",
            )}
          >
            <button
              type="button"
              onClick={() => chatInputRef.current?.focus()}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 sm:size-10"
              aria-label="聚焦輸入欄"
            >
              <Plus className="size-5 sm:size-6" aria-hidden />
            </button>
            <input
              ref={chatInputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.nativeEvent.isComposing || event.repeat) {
                  return;
                }
                event.preventDefault();
                void handleSend();
              }}
              placeholder={t.chat.placeholder}
              data-testid="chat-input"
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none sm:py-3"
            />

            <button
              type="button"
              onClick={handleToggleVoiceInput}
              className={cn(
                "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-all sm:size-10",
                isVoiceInputActive
                  ? "bg-red-500 text-white shadow-[0_0_0_6px_rgba(239,68,68,0.14)]"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              )}
              aria-label={isVoiceInputActive ? "停止語音輸入" : "開始語音輸入"}
              aria-pressed={isVoiceInputActive}
            >
              <Mic className="size-[18px] sm:size-5" aria-hidden />
            </button>

            {isSending ? (
              <button
                type="button"
                onClick={handleStopGeneration}
                data-testid="chat-stop-button"
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-800 sm:size-12"
                aria-label={t.chat.stopGenerationAria}
              >
                <Square className="size-4 fill-current" aria-hidden />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSend()}
                disabled={!input.trim()}
                data-testid="chat-send-button"
                className="flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-30 sm:size-12"
                aria-label={t.chat.sendAria}
              >
                <ArrowUp className="size-5 sm:size-6" aria-hidden />
              </button>
            )}
          </div>
        </div>
      </div>

      <div
        className="relative z-10 hidden shrink-0 overflow-y-auto border-l border-slate-300 bg-white p-5 shadow-[-1px_0_0_rgba(15,23,42,0.08)] lg:block"
        style={{ width: contextPanelWidth }}
      >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="調整目前行程脈絡寬度"
          title="拖曳調整寬度"
          onPointerDown={startContextPanelResize}
          className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-slate-400/50"
        />
        <h3 className="mb-2 text-sm font-semibold text-slate-900">即時行程</h3>

        {hasContextPanel ? (
          <div className="flex flex-col gap-2">
            <div className="relative h-72 overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <ChatContextMapView embedded readOnly />
            </div>
            {tripStore.tripId && tripStore.itinerary.length === 0 ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                目前行程尚未載入完成，系統正在同步最新內容。
              </div>
            ) : null}
            <div className="relative h-[900px] overflow-hidden rounded-3xl border border-slate-200 bg-white">
              <ChatContextItineraryPanel embedded enablePoiAdd={false} />
            </div>
          </div>
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-900">{t.chat.contextEmptyTitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-500">{t.chat.contextEmptyBody}</p>
          </div>
        )}
      </div>

      <PlanningWaitGame
        steps={activePlanningSteps}
        isPlanning={isPlanningActive}
        isWaiting={isSending}
        planningComplete={planningComplete}
        promptDelayMs={15000}
        suppressFloatingPrompt={false}
        gameOpen={skyDashOpen}
        onGameOpenChange={setSkyDashOpen}
      />

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={() => setSelectedVideo(null)}
        onRefreshSummary={
          selectedVideo?.videoId ? () => refreshVideoSummary(selectedVideo) : undefined
        }
      />
      <SourceDrawer
        source={sourceDrawerSource}
        open={sourceDrawerSource !== null}
        onClose={() => setSourceDrawerSource(null)}
      />
    </div>
  );
}
