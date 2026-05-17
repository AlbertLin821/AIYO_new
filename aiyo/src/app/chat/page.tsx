"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import ChatScenicBackground from "@/components/effects/ChatScenicBackground";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  DollarSign,
  Heart,
  Loader2,
  MapPin,
  Plus,
  Send,
} from "lucide-react";
import ChatBackgroundPicker from "@/components/chat/ChatBackgroundPicker";
import ChatHistorySidebar from "@/components/chat/ChatHistorySidebar";
import ChatWorkflowModal from "@/components/chat/ChatWorkflowModal";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import TravelPlanCard from "@/components/chat/TravelPlanCard";
import VideoCard from "@/components/home/VideoCard";
import { zhTW as t } from "@/locales/zh-TW";
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
import {
  type ChatBackgroundPresetId,
  getChatBackgroundPreset,
  persistChatBackgroundPresetId,
  readChatBackgroundPresetId,
} from "@/lib/chatBackground";
import { buildWorkflowSteps } from "@/lib/workflowSteps";
import { cn } from "@/lib/utils";
import { reviseTripPlan, sendChatMessage } from "@/services/aiClient";
import { createNewTrip, listTripsForLibrary, setActiveTrip } from "@/services/itineraryClient";
import { syncService } from "@/services/syncService";
import { fetchVideoRecommendations, shouldSkipClientVideoSummarize, summarizeVideo } from "@/services/videoClient";
import { useChatStore } from "@/stores/useChatStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUserStore } from "@/stores/useUserStore";
import { useVideoStore } from "@/stores/useVideoStore";
import type { ItineraryListItem } from "@/lib/itinerary-sort";
import type {
  AiProposedChange,
  ChatMessage,
  ChatQuestionAnswer,
  QuestionCardPayload,
  StatusStepPayload,
  TripPlanItem,
  TripProfile,
  VideoRecommendation,
  VideoSummaryResult,
} from "@/types";

const VideoSummaryDrawer = dynamic(
  () => import("@/components/home/VideoSummaryDrawer"),
  { ssr: false },
);

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

function buildAssistantLocalMessage(content: string): ChatMessage {
  return {
    id: `chat_assistant_local_${Date.now()}`,
    role: "assistant",
    content,
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    responseType: "text_message",
  };
}

function formatTripUpdatedDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString("zh-TW", {
    month: "short",
    day: "numeric",
  });
}

function shouldRecommendVideos(message: string): boolean {
  return /影片|youtube|YouTube|video|vlog|推薦.*看|找.*看|旅遊.*看|景點.*影片/i.test(message);
}

function isItineraryMutationCommand(message: string): boolean {
  return /新增|加入|加上|刪除|移除|修改|調整|改成|換成|改到|提前|延後|移到|重排|重新規劃|幫我(?:安排|規劃|新增|加入|調整|修改|刪除|移除)|請(?:安排|規劃|新增|加入|調整|修改|刪除|移除)/u.test(message);
}

type AddItineraryChange = Extract<AiProposedChange, { type: "add_itinerary_item" }>;
type ExistingItemChange = Extract<
  AiProposedChange,
  { type: "update_itinerary_item" | "remove_itinerary_item" }
>;

function buildItineraryItemFromAiChange(change: AddItineraryChange): TripPlanItem {
  const title = change.title.trim() || change.locationName?.trim() || "AI 建議行程";
  return {
    id: `ai_chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    dayNumber: change.day,
    time: change.time,
    title,
    type: /夜市|飯|餐|小吃|美食|魚頭/.test(title) ? "restaurant" : "attraction",
    notes: [change.locationName ? `地點：${change.locationName}` : "", change.notes || ""].filter(Boolean).join("\n") || undefined,
    source: "ai",
    location: undefined,
  };
}

function compactItineraryText(value: string): string {
  return value
    .toLowerCase()
    .replace(/臺/g, "台")
    .replace(/[^\p{Letter}\p{Number}]+/gu, "")
    .trim();
}

function findItineraryItemTarget(change: ExistingItemChange) {
  const itinerary = useTripStore.getState().itinerary;
  const scopedDays = change.day
    ? itinerary.filter((day) => day.dayNumber === change.day)
    : itinerary;
  if (change.itemId) {
    for (const day of scopedDays) {
      const item = day.items.find((candidate) => candidate.id === change.itemId);
      if (item) {
        return { dayNumber: day.dayNumber, item };
      }
    }
  }

  const targetTitle = compactItineraryText(change.targetTitle || "");
  if (!targetTitle) {
    return null;
  }
  for (const day of scopedDays) {
    const item = day.items.find((candidate) => {
      const title = compactItineraryText(candidate.title);
      const location = compactItineraryText(candidate.location?.name || "");
      return title.includes(targetTitle) || targetTitle.includes(title) || Boolean(location && (location.includes(targetTitle) || targetTitle.includes(location)));
    });
    if (item) {
      return { dayNumber: day.dayNumber, item };
    }
  }
  return null;
}

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

export default function ChatPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [input, setInput] = useState("");
  const [recommendedVideos, setRecommendedVideos] = useState<VideoRecommendation[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecommendation | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [historySidebarExpanded, setHistorySidebarExpanded] = useState(true);
  const [chatBackgroundId, setChatBackgroundId] = useState<ChatBackgroundPresetId>("mist");
  const [tripProfile, setTripProfile] = useState<TripProfile | null>(null);
  const [streamingStatusSteps, setStreamingStatusSteps] = useState<StatusStepPayload[]>([]);
  const [workflowModal, setWorkflowModal] = useState<{
    open: boolean;
    steps: StatusStepPayload[];
    questionCard: QuestionCardPayload | null;
    tripProfile: TripProfile | null;
  }>({
    open: false,
    steps: [],
    questionCard: null,
    tripProfile: null,
  });

  const [tripPickerOpen, setTripPickerOpen] = useState(false);
  const [tripPickerTrips, setTripPickerTrips] = useState<ItineraryListItem[]>([]);
  const [tripPickerLoading, setTripPickerLoading] = useState(false);
  const [tripPickerError, setTripPickerError] = useState<string | null>(null);
  const [tripPickerAction, setTripPickerAction] = useState<"new" | string | null>(null);
  const [expandedContextDays, setExpandedContextDays] = useState<Record<number, boolean>>({});
  const [contextPanelWidth, setContextPanelWidth] = useState(288);
  const [autoSummaryProgress, setAutoSummaryProgress] = useState<{ current: number; total: number } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const statusStreamRef = useRef<EventSource | null>(null);
  const videoSummaryQueueTokenRef = useRef(0);
  const videoSummaryInflightRef = useRef(new Map<string, Promise<VideoSummaryResult>>());
  const autoSummaryActiveRef = useRef(false);
  const hydratedConversationTripRef = useRef<string | null>(null);
  const workflowModalDismissedRef = useRef(false);
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
  } = useChatStore();
  const tripStore = useTripStore();
  const userStore = useUserStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const setSummaryDiagnostics = useVideoStore((state) => state.setSummaryDiagnostics);
  const setIsSummarizing = useVideoStore((state) => state.setIsSummarizing);

  useEffect(() => {
    if (!isSending || streamingStatusSteps.length === 0) {
      return;
    }
    setWorkflowModal((prev) => ({
      ...prev,
      open: true,
      steps: streamingStatusSteps,
    }));
  }, [isSending, streamingStatusSteps]);

  useEffect(() => {
    if (isSending || !workflowModal.open || workflowModal.questionCard) {
      return;
    }
    const view = buildWorkflowSteps(workflowModal.steps);
    if (!view.length) {
      return;
    }
    if (view.some((step) => step.status === "waiting_input" || step.status === "running")) {
      return;
    }
    if (!view.every((step) => step.status === "completed")) {
      return;
    }
    const timer = window.setTimeout(() => {
      setWorkflowModal({ open: false, steps: [], questionCard: null, tripProfile: null });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [isSending, workflowModal.open, workflowModal.questionCard, workflowModal.steps]);

  useEffect(() => {
    const last = messages[messages.length - 1];
    if (
      workflowModalDismissedRef.current ||
      isSending ||
      last?.role !== "assistant" ||
      last.responseType !== "question_card" ||
      !last.questionCard
    ) {
      return;
    }
    setWorkflowModal({
      open: true,
      steps: last.statusSteps || [],
      questionCard: last.questionCard,
      tripProfile: last.tripProfile ?? tripProfile,
    });
  }, [activeConversationId, messages, isSending, tripProfile]);

  const tagConfigs = [
    { icon: MapPin, label: t.chat.tagDestination },
    { icon: CalendarDays, label: t.chat.tagDays },
    { icon: DollarSign, label: t.chat.tagBudget },
  ];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, isSending, errorMessage]);

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
    setChatBackgroundId(readChatBackgroundPresetId());
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
        syncService.applyTripSwitch(snapshot);
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

  async function openNewConversationPicker() {
    if (isSending || tripPickerLoading || tripPickerAction) {
      return;
    }
    setTripPickerOpen(true);
    setTripPickerError(null);
    setTripPickerLoading(true);
    try {
      const rows = await listTripsForLibrary("recent");
      setTripPickerTrips(rows);
    } catch (error) {
      setTripPickerError(error instanceof Error ? error.message : "無法載入行程清單。");
    } finally {
      setTripPickerLoading(false);
    }
  }

  function finishNewConversationSetup(tripId: string, title?: string) {
    createConversation(title, tripId);
    setInput("");
    setTripProfile(null);
    setTripPickerOpen(false);
    setTripPickerAction(null);
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
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      if (currentConversationId) {
        setConversationTrip(currentConversationId, conversationTripId);
      }
      return conversationTripId;
    }

    const created = await createNewTrip();
    const snapshot = await setActiveTrip(created.tripId);
    syncService.applyTripSwitch(snapshot);
    syncService.startRealtime(snapshot.collaboration?.roomId ?? null);

    const nextConversationId = useChatStore.getState().activeConversationId;
    if (nextConversationId) {
      setConversationTrip(nextConversationId, created.tripId);
    } else {
      createConversation(conversationTitle, created.tripId);
    }
    return created.tripId;
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

  async function startConversationWithTrip(tripId: string) {
    if (tripPickerAction) {
      return;
    }
    setTripPickerAction(tripId);
    setTripPickerError(null);
    try {
      const selectedTrip = tripPickerTrips.find((trip) => trip.id === tripId);
      if (tripId !== useTripStore.getState().tripId) {
        const snapshot = await setActiveTrip(tripId);
        syncService.applyTripSwitch(snapshot);
        syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      }
      finishNewConversationSetup(tripId, selectedTrip?.title);
    } catch (error) {
      setTripPickerError(error instanceof Error ? error.message : "無法切換行程。");
      setTripPickerAction(null);
    }
  }

  async function startConversationWithNewTrip() {
    if (tripPickerAction) {
      return;
    }
    setTripPickerAction("new");
    setTripPickerError(null);
    try {
      const created = await createNewTrip();
      const snapshot = await setActiveTrip(created.tripId);
      syncService.applyTripSwitch(snapshot);
      syncService.startRealtime(snapshot.collaboration?.roomId ?? null);
      finishNewConversationSetup(created.tripId);
    } catch (error) {
      setTripPickerError(error instanceof Error ? error.message : "無法建立新行程。");
      setTripPickerAction(null);
    }
  }

  function stopStatusStream() {
    logFrontendDebugEvent("chat-sse", "stream-stop");
    statusStreamRef.current?.close();
    statusStreamRef.current = null;
    setStreamingStatusSteps([]);
  }

  function startStatusStream() {
    stopStatusStream();
    const sessionId = `chat_${Date.now()}`;
    const processId = startFrontendDebugProcess("chat-sse", "監聽聊天進度 SSE", {
      sessionId,
    });
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

  function handleWorkflowQuestionSubmit(answers: ChatQuestionAnswer[], displayMessage: string) {
    const profile = workflowModal.tripProfile ?? tripProfile;
    setWorkflowModal((prev) => ({
      ...prev,
      questionCard: null,
      open: true,
    }));
    void handleSend("", {
      displayMessage,
      displayAsAssistant: true,
      questionAnswers: answers,
      tripProfile: profile,
    });
  }

  async function handleSend(
    rawInput?: string,
    options?: {
      displayMessage?: string;
      displayAsAssistant?: boolean;
      questionAnswers?: ChatQuestionAnswer[];
      tripProfile?: TripProfile | null;
    },
  ) {
    const hasQuestionAnswers = Boolean(options?.questionAnswers?.length);
    const message = (rawInput || input).trim();
    if ((!message && !hasQuestionAnswers) || isSending) {
      return;
    }

    stopAutoVideoSummaryQueue();

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
    appendMessage(
      options?.displayAsAssistant
        ? buildAssistantLocalMessage(displayMessage)
        : buildUserMessage(displayMessage),
    );
    setInput("");
    setErrorMessage(null);
    setIsSending(true);
    const chatProcessId = startFrontendDebugProcess("chat-ui", "聊天送出流程", {
      messagePreview: (message || options?.displayMessage || "").slice(0, 80),
      hasQuestionAnswers,
      hasTripProfile: Boolean(options?.tripProfile ?? tripProfile),
    });
    const { sessionId: progressSessionId, processId: sseProcessId } = startStatusStream();

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
      const shouldUseTripRevisionFlow =
        !hasQuestionAnswers &&
        !options?.displayAsAssistant &&
        Boolean(activeProfile) &&
        useTripStore.getState().itinerary.length > 0 &&
        isItineraryMutationCommand(message);

      if (shouldUseTripRevisionFlow && activeProfile) {
        const revisionProfile: TripProfile = {
          ...activeProfile,
          plan_integration: "direct_merge",
        };
        updateFrontendDebugProcess(chatProcessId, "trip-revision-reroute", {
          progressSessionId,
        });
        const response = await reviseTripPlan({
          instruction: message,
          tripProfile: revisionProfile,
          context: {
            destination: revisionProfile.destination || planningSnapshot.destination,
            days: revisionProfile.duration_days || planningSnapshot.days,
            budget: planningSnapshot.budget,
            itinerary: useTripStore.getState().itinerary,
            tripStartDate: revisionProfile.travel_dates?.start || undefined,
            tripEndDate: revisionProfile.travel_dates?.end || revisionProfile.travel_dates?.start || undefined,
            preferences: {
              interests: revisionProfile.preferences,
              pace:
                revisionProfile.pace === "relaxed" || revisionProfile.pace === "intensive"
                  ? revisionProfile.pace
                  : useUserStore.getState().travelPace || "moderate",
              transportPreference: revisionProfile.transportation || useUserStore.getState().preferredTransport,
              budget: planningSnapshot.budget,
            },
          },
          progressSessionId,
        });
        appendMessage(response.reply);
        if (response.tripProfile) {
          setTripProfile(response.tripProfile);
        }
        await ensureTripPlanningContext(
          response.tripProfile?.destination ||
            activeConversation?.title ||
            displayMessage,
        );
        if (response.itinerarySuggestion) {
          await applyGeneratedTripPlan(response);
        } else if (response.proposedChanges?.length) {
          await applyAiProposedChanges(response.proposedChanges, { navigate: false });
        } else {
          pushToast({
            variant: "warning",
            title: "沒有可套用的行程變更",
            description: "AI 已回覆，但這次沒有產生可直接同步到行程的修改內容。",
          });
        }
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
      const response = await sendChatMessage({
        message,
        messages: previousMessages.slice(-10),
        context: {
          destination: planningSnapshot.destination,
          days: planningSnapshot.days,
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
        structuredTravelPlanning: true,
        tripProfile: options?.tripProfile ?? tripProfile ?? undefined,
        questionAnswers: options?.questionAnswers,
        progressSessionId,
      });
      appendMessage(response.reply);
      if (response.tripProfile) {
        setTripProfile(response.tripProfile);
      }
      if (response.reply.responseType === "question_card" && response.reply.questionCard) {
        workflowModalDismissedRef.current = false;
        setWorkflowModal({
          open: true,
          steps: response.reply.statusSteps?.length ? response.reply.statusSteps : streamingStatusSteps,
          questionCard: response.reply.questionCard,
          tripProfile: response.tripProfile ?? options?.tripProfile ?? tripProfile ?? null,
        });
      } else if (response.reply.statusSteps?.length) {
        setWorkflowModal((prev) => ({
          open: true,
          steps: response.reply.statusSteps || prev.steps,
          questionCard: null,
          tripProfile: response.tripProfile ?? prev.tripProfile,
        }));
      }
      const shouldPersistPlanningResult =
        Boolean(response.itinerarySuggestion) ||
        Boolean(response.proposedChanges?.length && response.reply.responseType !== "question_card");
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
      const shouldApplyItineraryUpdate =
        Boolean(useTripStore.getState().tripId) &&
        (isItineraryMutationCommand(message) || shouldDirectMergeGeneratedPlan);
      if (shouldApplyItineraryUpdate) {
        if (response.itinerarySuggestion) {
          await applyGeneratedTripPlan(response);
        } else if (response.proposedChanges?.length) {
          await applyAiProposedChanges(response.proposedChanges, { navigate: false });
        }
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

      if (shouldRecommendVideos(message)) {
        const videoSummaryQueueToken = videoSummaryQueueTokenRef.current + 1;
        videoSummaryQueueTokenRef.current = videoSummaryQueueToken;
        autoSummaryActiveRef.current = false;
        setAutoSummaryProgress(null);
        setIsLoadingVideos(true);
        setIsSummarizing(false);
        setVideoError(null);
        let autoSummaryStarted = false;
        try {
          updateFrontendDebugProcess(chatProcessId, "video-recommendation-start", {
            destination: planningSnapshot.destination,
          });
          const outcome = await fetchVideoRecommendations({
            destination: planningSnapshot.destination,
            keyword: message,
            days: planningSnapshot.days,
            preferences: useUserStore.getState().interests,
            limit: 6,
          });
          setRecommendedVideos(outcome.videos);
          autoSummaryStarted = outcome.videos
            .slice(0, 6)
            .some((video) => !shouldSkipClientVideoSummarize(video));
          updateFrontendDebugProcess(chatProcessId, "video-recommendation-complete", {
            resultCount: outcome.videos.length,
            source: outcome.source,
            titles: outcome.videos.slice(0, 6).map((video) => video.title),
            autoSummaryStarted,
          });
          if (autoSummaryStarted) {
            void processRecommendedVideoSummaries(
              outcome.videos,
              planningSnapshot.destination,
              videoSummaryQueueToken,
            );
          }
          if (outcome.source === "mock-fallback") {
            pushToast({
              variant: "warning",
              title: t.video.mockVideosTitle,
              description: outcome.fallbackReason || t.video.mockVideosDesc,
            });
          }
        } catch (error) {
          failFrontendDebugProcess(chatProcessId, error, {
            stage: "video-recommendation",
          });
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
      } else {
        startAutoVideoSummaryQueue(recommendedVideos, planningSnapshot.destination);
      }
      finishFrontendDebugProcess(chatProcessId, {
        progressSessionId,
        finalReplyType: response.reply.responseType,
      });
    } catch (error) {
      failFrontendDebugProcess(chatProcessId, error, {
        progressSessionId,
      });
      const description =
        error instanceof Error ? error.message : t.chat.requestFailedGeneric;
      setErrorMessage(description);
      pushToast({
        variant: "error",
        title: t.chat.requestFailed,
        description,
        actionLabel: t.common.retry,
        action: () => void handleSend(message),
      });
    } finally {
      finishFrontendDebugProcess(sseProcessId, {
        progressSessionId,
        reason: "handleSend-finally",
      });
      stopStatusStream();
      setIsSending(false);
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
    const reviseProcessId = startFrontendDebugProcess("trip-revise-ui", "前端送出行程修改", {
      instruction,
      destination: activeProfile.destination,
    });
    const { sessionId: progressSessionId, processId: sseProcessId } = startStatusStream();

    try {
      updateFrontendDebugProcess(reviseProcessId, "request-dispatched", {
        progressSessionId,
      });
      const response = await reviseTripPlan({
        instruction,
        tripProfile: revisionProfile,
        context: {
          destination: revisionProfile.destination || planningSnapshot.destination,
          days: revisionProfile.duration_days || planningSnapshot.days,
          budget: planningSnapshot.budget,
          itinerary: useTripStore.getState().itinerary,
          tripStartDate: revisionProfile.travel_dates?.start || undefined,
          tripEndDate: revisionProfile.travel_dates?.end || revisionProfile.travel_dates?.start || undefined,
          preferences: {
            interests: revisionProfile.preferences,
            pace:
              revisionProfile.pace === "relaxed" || revisionProfile.pace === "intensive"
                ? revisionProfile.pace
                : useUserStore.getState().travelPace || "moderate",
            transportPreference: revisionProfile.transportation || useUserStore.getState().preferredTransport,
            budget: planningSnapshot.budget,
          },
        },
        progressSessionId,
      });
      appendMessage(response.reply);
      if (response.tripProfile) {
        setTripProfile(response.tripProfile);
      }
      if (response.itinerarySuggestion) {
        await applyGeneratedTripPlan(response);
      } else if (response.proposedChanges?.length) {
        await applyAiProposedChanges(response.proposedChanges, { navigate: false });
      } else {
        pushToast({
          variant: "warning",
          title: "沒有可套用的行程變更",
          description: "AI 已回覆，但這次沒有產生可直接同步到行程的修改內容。",
        });
      }
      finishFrontendDebugProcess(reviseProcessId, {
        progressSessionId,
        replyType: response.reply.responseType,
      });
    } catch (error) {
      failFrontendDebugProcess(reviseProcessId, error, {
        progressSessionId,
      });
      const description =
        error instanceof Error ? error.message : t.chat.requestFailedGeneric;
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
      stopStatusStream();
      setIsSending(false);
    }
  }

  async function applyAiProposedChanges(
    changes: AiProposedChange[],
    options: { navigate?: boolean; silent?: boolean } = {},
  ) {
    if (!changes.length) {
      return;
    }
    let appliedCount = 0;
    const trip = useTripStore.getState();
    if (trip.itinerary.length === 0) {
      trip.addDay();
    }
    const days = useTripStore.getState().itinerary;
    const maxDay = Math.max(1, ...days.map((day) => day.dayNumber));
    for (const change of changes) {
      if (change.type === "add_itinerary_item") {
        const targetDay = Math.max(1, Math.floor(Number(change.day) || 1));
        while (!useTripStore.getState().itinerary.some((day) => day.dayNumber === targetDay)) {
          useTripStore.getState().addDay();
          if (useTripStore.getState().itinerary.length > Math.max(targetDay, maxDay + 3)) {
            break;
          }
        }
        useTripStore.getState().addItineraryItem(
          targetDay,
          buildItineraryItemFromAiChange({ ...change, day: targetDay }),
        );
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
          patch.location = {
            ...target.item.location,
            name: change.locationName,
          };
        } else if (!change.notes) {
          patch.notes = [target.item.notes || "", `地點：${change.locationName}`].filter(Boolean).join("\n");
        }
      }
      if (Object.keys(patch).length > 0) {
        useTripStore.getState().updateItineraryItem(target.dayNumber, target.item.id, patch);
        appliedCount += 1;
      }
    }

    if (appliedCount > 0) {
      await syncService.flushTripSyncNow({ force: true });
      if (!options.silent) {
        pushToast({
          variant: "success",
          title: "已套用 AI 建議",
          description: `已更新 ${appliedCount} 筆行程內容。`,
        });
      }
      if (options.navigate ?? true) {
        router.push("/itinerary");
      }
    } else if (!options.silent) {
      pushToast({
        variant: "warning",
        title: "找不到可套用的行程項目",
        description: "AI 回覆了修改建議，但目前行程中沒有找到對應項目。",
      });
    }
  }

  async function applyGeneratedTripPlan(
    response: Awaited<ReturnType<typeof reviseTripPlan>>,
    options: { silent?: boolean } = {},
  ) {
    if (!response.itinerarySuggestion) {
      return false;
    }
    const currentTrip = useTripStore.getState();
    currentTrip.replaceTripPlan(response.itinerarySuggestion, {
      destination: currentTrip.destination || response.tripProfile?.destination || planningSnapshot.destination,
      days: response.itinerarySuggestion.days.length,
      budget:
        currentTrip.budget ||
        planningSnapshot.budget ||
        readBudgetAmountFromText(response.tripProfile?.budget),
      title: currentTrip.title || response.tripProfile?.destination || currentTrip.destination,
    });
    await syncService.flushTripSyncNow({ force: true });
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
    setRecommendedVideos((videos) =>
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

  const emptyChatHint =
    status === "authenticated" ? t.chat.emptyHintAuthed : t.chat.emptyHintGuest;
  const chatBackgroundPreset = getChatBackgroundPreset(chatBackgroundId);

  function handleChatBackgroundChange(nextId: ChatBackgroundPresetId) {
    setChatBackgroundId(nextId);
    persistChatBackgroundPresetId(nextId);
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
      className="chat-page-root relative flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 overflow-hidden lg:h-screen"
      data-chat-theme={chatBackgroundPreset.theme}
    >
      <ChatScenicBackground preset={chatBackgroundPreset} />
      {tripPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4 py-6 backdrop-blur-sm">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="chat-trip-picker-title"
            className="w-full max-w-lg overflow-hidden rounded-3xl border border-border-light bg-white shadow-2xl"
          >
            <div className="border-b border-border-light px-5 py-4">
              <p id="chat-trip-picker-title" className="text-base font-semibold text-foreground">
                和AI聊聊你的行程
              </p>
            </div>

            <div className="max-h-[60vh] space-y-3 overflow-y-auto px-5 py-4">
              <button
                type="button"
                disabled={Boolean(tripPickerAction)}
                onClick={() => void startConversationWithNewTrip()}
                className="flex w-full items-start justify-between gap-3 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <span>
                  <span className="block text-sm font-semibold text-primary">
                    開始新旅程
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted">
                    這個對話會從空白行程開始，後續套用 AI 建議時會儲存在新行程中。
                  </span>
                </span>
                {tripPickerAction === "new" ? (
                  <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden />
                ) : (
                  <Plus className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                )}
              </button>

              {tripPickerLoading ? (
                <div className="flex items-center gap-2 rounded-2xl border border-border-light bg-surface px-4 py-3 text-sm text-muted">
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  載入行程清單中…
                </div>
              ) : tripPickerTrips.length > 0 ? (
                <div className="space-y-2">
                  {tripPickerTrips.map((trip) => {
                    const isCurrentTrip = trip.id === tripStore.tripId;
                    const isSwitching = tripPickerAction === trip.id;
                    return (
                      <button
                        key={trip.id}
                        type="button"
                        disabled={Boolean(tripPickerAction)}
                        onClick={() => void startConversationWithTrip(trip.id)}
                        className="flex w-full items-start justify-between gap-3 rounded-2xl border border-border-light bg-white px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-foreground">
                              {trip.title}
                            </span>
                            {isCurrentTrip && (
                              <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                                目前
                              </span>
                            )}
                          </span>
                          <span className="mt-1 block text-xs text-muted">
                            {trip.destination} · {trip.days} 天 · 最近編輯 {formatTripUpdatedDate(trip.updatedAt)}
                          </span>
                        </span>
                        {isSwitching && (
                          <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-primary" aria-hidden />
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-4 py-5 text-center text-sm text-muted">
                  目前沒有可選擇的行程。
                </div>
              )}

              {tripPickerError && (
                <p className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {tripPickerError}
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-border-light px-5 py-4">
              <button
                type="button"
                disabled={Boolean(tripPickerAction)}
                onClick={() => setTripPickerOpen(false)}
                className="rounded-xl border border-border-light bg-white px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-cream/60 disabled:cursor-not-allowed disabled:opacity-60"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      <ChatHistorySidebar
        expanded={historySidebarExpanded}
        conversations={conversations}
        activeConversationId={activeConversationId}
        userName={session?.user?.name}
        userImage={session?.user?.image}
        onExpand={() => persistHistorySidebarExpanded(true)}
        onCollapse={() => persistHistorySidebarExpanded(false)}
        onNewConversation={() => void openNewConversationPicker()}
        onSelectConversation={(conversationId) => void selectConversationForChat(conversationId)}
        onDeleteConversation={(conversationId) => void deleteConversation(conversationId)}
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <div className="relative z-20 overflow-visible border-b border-chat px-6 py-4 chat-glass-panel">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
              <h1 className="font-semibold text-chat-fg">{t.chat.pageTitle}</h1>
              <ChatBackgroundPicker value={chatBackgroundId} onChange={handleChatBackgroundChange} />
            </div>
            <button
              type="button"
              onClick={() => void openNewConversationPicker()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-chat px-3 py-2 text-xs font-medium text-chat-fg chat-glass-card transition-colors hover:bg-[var(--chat-hover)] md:hidden"
            >
              <Plus className="size-3.5" aria-hidden />
              {t.chat.newConversation}
            </button>
          </div>
        </div>
        {conversations.length > 0 && (
          <div className="relative z-10 flex gap-2 overflow-x-auto border-b border-chat px-4 py-3 chat-glass-panel md:hidden">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => void selectConversationForChat(conversation.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  conversation.id === activeConversationId
                    ? "border-primary/30 bg-[var(--chat-chip-active-bg)] text-chat-fg"
                    : "border-chat bg-[var(--chat-chip-idle-bg)] text-chat-muted"
                }`}
              >
                {conversation.title}
              </button>
            ))}
          </div>
        )}

        <div className="relative z-10 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !isSending && !errorMessage && (
            <div className="rounded-2xl border border-dashed border-chat-dashed px-4 py-8 text-center text-sm text-chat-muted chat-glass-card">
              <p className="font-medium text-chat-fg">{t.chat.emptyTitle}</p>
              <p className="mt-2 text-xs text-chat-muted">{emptyChatHint}</p>
            </div>
          )}

          {messages.map((message, index) => (
            <motion.div
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
                      ? "bg-gradient-to-br from-secondary to-primary"
                      : "bg-gradient-to-br from-lavender to-primary"
                  }`}
                >
                  {message.role === "user" ? t.chat.userShort : t.chat.aiShort}
                </div>

                <div>
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      message.role === "user"
                        ? "rounded-br-md bg-primary text-white"
                        : message.responseType === "travel_plan"
                          ? "rounded-bl-md bg-transparent p-0 text-foreground"
                          : "rounded-bl-md chat-glass-card-strong text-chat-soft shadow-none"
                    }`}
                  >
                    {message.responseType === "question_card" && message.questionCard ? (
                      <MarkdownMessage
                        content={message.content?.trim() || t.chat.workflowModalHint}
                      />
                    ) : message.responseType === "travel_plan" && message.travelPlan ? (
                      <div className="space-y-3">
                        <TravelPlanCard
                          plan={message.travelPlan}
                          revisionDisabled={isSending}
                          onRevise={(instruction) => void handleRevisePlan(instruction, message.tripProfile || tripProfile)}
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
                  {message.role !== "user" && (message.proposedChanges || []).length > 0 && (
                    <button
                      type="button"
                      data-testid="chat-apply-proposed-changes"
                      onClick={() => void applyAiProposedChanges(message.proposedChanges || [])}
                      className="mt-2 rounded-xl bg-primary px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-primary-dark"
                    >
                      套用建議到行程
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}

          {isSending && !workflowModal.open ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-lavender to-primary text-xs text-white">
                {t.chat.aiShort}
              </div>
              <div className="flex items-center gap-2 rounded-2xl rounded-bl-md px-4 py-3 chat-glass-card-strong text-sm text-chat-muted">
                <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                {t.chat.workflowProcessing}
              </div>
            </motion.div>
          ) : null}

          {errorMessage && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger backdrop-blur-sm">
              {errorMessage}
            </div>
          )}

          {(isLoadingVideos || videoError || recommendedVideos.length > 0) && (
            <section className="rounded-2xl px-4 py-4 chat-glass-card-strong text-chat-soft">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-chat-fg">AI 推薦影片</h2>
                  {autoSummaryProgress && (
                    <p className="mt-1 text-xs text-chat-muted">
                      正在依序處理影片資料 {autoSummaryProgress.current}/{autoSummaryProgress.total}
                    </p>
                  )}
                </div>
                {isLoadingVideos && <Loader2 className="size-4 animate-spin text-primary" aria-hidden />}
              </div>
              {videoError && (
                <p className="mb-3 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
                  {videoError}
                </p>
              )}
              {recommendedVideos.length > 0 && (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {recommendedVideos.map((video, index) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      index={index}
                      onClick={() => void openVideoSummary(video)}
                    />
                  ))}
                </div>
              )}
            </section>
          )}
          <div ref={messagesEndRef} aria-hidden className="h-px shrink-0" />
        </div>

        <div className="relative z-10 px-6 pb-6 pt-3">
          <div className="flex items-center gap-3 rounded-2xl px-4 py-2 chat-glass-card-strong">
            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSend()}
              placeholder={t.chat.placeholder}
              data-testid="chat-input"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-chat-fg placeholder-chat focus:outline-none"
            />

            <button
              type="button"
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              data-testid="chat-send-button"
              className="flex size-10 cursor-pointer items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-30"
              aria-label={t.floatingChat.sendAria}
            >
              <Send className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>

        <div
          className="relative z-10 hidden shrink-0 overflow-y-auto border-l border-chat p-5 chat-glass-panel lg:block"
          style={{ width: contextPanelWidth }}
        >
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="調整目前行程脈絡寬度"
          title="拖曳調整寬度"
          onPointerDown={startContextPanelResize}
          className="absolute left-0 top-0 z-20 h-full w-2 -translate-x-1 cursor-col-resize touch-none bg-transparent transition-colors hover:bg-primary/20"
        />
        <h3 className="mb-4 text-sm font-semibold text-chat-fg">{t.chat.contextTitle}</h3>

        {hasContextPanel ? (
          <div className="flex flex-col gap-4">
            {tagConfigs.map((tag, index) => {
              const Icon = tag.icon;
              return (
                <button
                  type="button"
                  key={tag.label}
                  onClick={() => router.push("/profile")}
                  className="flex w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left chat-glass-card transition-colors hover:bg-[var(--chat-hover)] focus:outline-none focus:ring-2 focus:ring-primary/25"
                >
                  <Icon className="size-4 flex-shrink-0 text-emerald-200" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-chat-subtle">{tag.label}</p>
                    <p className="truncate text-sm font-medium text-chat-fg">{extractedValues[index]}</p>
                  </div>
                </button>
              );
            })}

            <div className="rounded-2xl p-3 chat-glass-card">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <Heart className="size-4 shrink-0 text-emerald-200" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-chat-subtle">{t.chat.tagItinerary}</p>
                    <p className="truncate text-sm font-semibold text-chat-fg">
                      {tripStore.itinerary.length > 0
                        ? `${tripStore.itinerary.length} 天行程`
                        : t.chat.valueUnset}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => router.push("/itinerary")}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
                >
                  編輯
                </button>
              </div>

              {tripStore.itinerary.length > 0 ? (
                <div className="space-y-2">
                  {tripStore.itinerary.map((day, index) => {
                    const displayOrdinal = index + 1;
                    const expanded = expandedContextDays[day.dayNumber] ?? displayOrdinal === 1;
                    return (
                      <div
                        key={day.dayNumber}
                        className="overflow-hidden rounded-xl chat-glass-card"
                      >
                        <button
                          type="button"
                          aria-expanded={expanded}
                          onClick={() => toggleContextDay(day.dayNumber)}
                          className="flex w-full items-center justify-between gap-2 bg-[var(--chat-chip-idle-bg)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--chat-hover)]"
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
                              D{displayOrdinal}
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-chat-fg">
                                第 {displayOrdinal} 天
                              </span>
                              <span className="block truncate text-[11px] text-chat-subtle">
                                {day.theme && !/^Day\s*\d+$/i.test(day.theme.trim())
                                  ? day.theme
                                  : `${day.items.length} 個活動`}
                              </span>
                            </span>
                          </div>
                          <ChevronDown
                            className={cn(
                              "size-4 shrink-0 text-chat-subtle transition-transform",
                              expanded ? "rotate-180" : "",
                            )}
                            aria-hidden
                          />
                        </button>

                        {expanded && (
                          <div className="space-y-2 border-t border-chat p-3">
                            {day.items.length > 0 ? (
                              day.items.map((item) => (
                                <div
                                  key={item.id}
                                  className="rounded-xl px-3 py-2 chat-glass-card"
                                >
                                  <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-start gap-2">
                                    <span className="mt-0.5 inline-flex w-14 shrink-0 justify-center rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                                      {item.time}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                      <p className="truncate text-xs font-semibold text-chat-fg">
                                        {item.title}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              ))
                            ) : (
                              <div className="rounded-xl border border-dashed border-chat-dashed px-3 py-4 text-center text-xs text-chat-subtle">
                                尚未安排活動
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-chat-dashed px-3 py-4 text-center text-xs text-chat-subtle">
                  尚未建立每日行程
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-chat-dashed px-4 py-6 text-center chat-glass-card">
            <p className="text-sm font-medium text-chat-fg">{t.chat.contextEmptyTitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-chat-muted">{t.chat.contextEmptyBody}</p>
          </div>
        )}
      </div>

      <ChatWorkflowModal
        open={workflowModal.open}
        steps={workflowModal.steps}
        questionCard={workflowModal.questionCard}
        disabled={isSending}
        onClose={() => {
          workflowModalDismissedRef.current = true;
          setWorkflowModal({ open: false, steps: [], questionCard: null, tripProfile: null });
        }}
        onSubmitQuestion={(answers, displayMessage) =>
          handleWorkflowQuestionSubmit(answers, displayMessage)
        }
      />

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={() => setSelectedVideo(null)}
        onRefreshSummary={
          selectedVideo?.videoId ? () => refreshVideoSummary(selectedVideo) : undefined
        }
      />
    </div>
  );
}
