"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Heart,
  History,
  Loader2,
  MapPin,
  Mic,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from "lucide-react";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import VideoCard from "@/components/home/VideoCard";
import { zhTW as t } from "@/locales/zh-TW";
import { applyPlanningUpdateToStores, derivePlanningSnapshot, extractPlanningUpdateFromText } from "@/lib/planningContext";
import { cn } from "@/lib/utils";
import { sendChatMessage } from "@/services/aiClient";
import { fetchVideoRecommendations, summarizeVideo } from "@/services/videoClient";
import { useChatStore } from "@/stores/useChatStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUserStore } from "@/stores/useUserStore";
import { useVideoStore } from "@/stores/useVideoStore";
import type { ChatMessage, VideoRecommendation } from "@/types";

const VideoSummaryDrawer = dynamic(
  () => import("@/components/home/VideoSummaryDrawer"),
  { ssr: false },
);

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

function shouldRecommendVideos(message: string): boolean {
  return /影片|youtube|YouTube|video|vlog|推薦.*看|找.*看|旅遊.*看|景點.*影片/i.test(message);
}

const CHAT_HISTORY_SIDEBAR_KEY = "aiyo:chat-history-sidebar-expanded";

export default function ChatPage() {
  const router = useRouter();
  const { status } = useSession();
  const [input, setInput] = useState("");
  const [recommendedVideos, setRecommendedVideos] = useState<VideoRecommendation[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoRecommendation | null>(null);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [historySidebarExpanded, setHistorySidebarExpanded] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const {
    conversations,
    activeConversationId,
    messages,
    createConversation,
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

  const tagConfigs = [
    { icon: MapPin, label: t.chat.tagDestination },
    { icon: CalendarDays, label: t.chat.tagDays },
    { icon: DollarSign, label: t.chat.tagBudget },
    { icon: Heart, label: t.chat.tagItinerary },
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

  function persistHistorySidebarExpanded(next: boolean) {
    setHistorySidebarExpanded(next);
    try {
      window.localStorage.setItem(CHAT_HISTORY_SIDEBAR_KEY, String(next));
    } catch {
      /* ignore */
    }
  }

  async function handleSend(rawInput?: string) {
    const message = (rawInput || input).trim();
    if (!message || isSending) {
      return;
    }

    applyPlanningUpdateToStores(extractPlanningUpdateFromText(message));

    const planningSnapshot = derivePlanningSnapshot({
      trip: useTripStore.getState(),
      user: useUserStore.getState(),
    });

    const previousMessages = useChatStore.getState().messages;
    appendMessage(buildUserMessage(message));
    setInput("");
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        message,
        messages: previousMessages.slice(-10),
        context: {
          destination: planningSnapshot.destination,
          days: planningSnapshot.days,
          budget: planningSnapshot.budget,
          itinerary: useTripStore.getState().itinerary,
          preferences: {
            interests: useUserStore.getState().interests,
            pace: useUserStore.getState().travelPace,
            transportPreference: useUserStore.getState().preferredTransport,
            budget: planningSnapshot.budget,
          },
        },
      });
      appendMessage(response.reply);

      if (shouldRecommendVideos(message)) {
        setIsLoadingVideos(true);
        setVideoError(null);
        try {
          const outcome = await fetchVideoRecommendations({
            destination: planningSnapshot.destination,
            keyword: message,
            days: planningSnapshot.days,
            preferences: useUserStore.getState().interests,
            limit: 6,
          });
          setRecommendedVideos(outcome.videos);
          if (outcome.source === "mock-fallback") {
            pushToast({
              variant: "warning",
              title: t.video.mockVideosTitle,
              description: outcome.fallbackReason || t.video.mockVideosDesc,
            });
          }
        } catch (error) {
          const description =
            error instanceof Error ? error.message : t.video.requestFailedGeneric;
          setVideoError(description);
          pushToast({
            variant: "error",
            title: t.video.requestFailed,
            description,
          });
        } finally {
          setIsLoadingVideos(false);
        }
      }
    } catch (error) {
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
      setIsSending(false);
    }
  }

  function handleVoiceHint() {
    pushToast({
      variant: "info",
      title: t.chat.voiceMapOnlyTitle,
      description: t.chat.voiceMapOnlyHint,
      actionLabel: t.chat.goToMap,
      action: () => router.push("/map"),
    });
  }

  async function openVideoSummary(video: VideoRecommendation) {
    setSummaryDiagnostics(null);
    setSelectedVideo(video);

    if (!video.videoId || video.summarySegments?.length || video.extractedLocations.length > 0) {
      return;
    }

    setIsLoadingVideos(true);
    try {
      const result = await summarizeVideo({
        videoId: video.videoId,
        title: video.title,
        destination: planningSnapshot.destination,
      });
      setRecommendedVideos((videos) =>
        videos.map((item) => (item.id === video.id ? result.video : item)),
      );
      setSelectedVideo(result.video);
      setSummaryDiagnostics({
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
      });
    } catch (error) {
      pushToast({
        variant: "error",
        title: t.video.requestFailed,
        description: error instanceof Error ? error.message : t.video.requestFailedGeneric,
      });
    } finally {
      setIsLoadingVideos(false);
    }
  }

  const planningSnapshot = derivePlanningSnapshot({
    trip: tripStore,
    user: userStore,
  });

  const extractedValues = [
    planningSnapshot.hasDestination ? planningSnapshot.destination : t.chat.valueUnset,
    planningSnapshot.hasPlannedDays
      ? `${planningSnapshot.days} ${t.chat.daysUnit}`
      : t.chat.valueUnset,
    planningSnapshot.hasBudget
      ? `${t.chat.currencyPrefix}${planningSnapshot.budget.toLocaleString()}`
      : t.chat.valueUnset,
    planningSnapshot.hasItinerary
      ? t.chat.plannedStops.replace("{n}", String(planningSnapshot.plannedStopCount))
      : t.chat.valueUnset,
  ];

  const emptyChatHint =
    status === "authenticated" ? t.chat.emptyHintAuthed : t.chat.emptyHintGuest;

  return (
    <div className="flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom,0px))] min-h-0 lg:h-screen">
      <aside
        className={cn(
          "hidden min-h-0 shrink-0 flex-col border-r border-border-light bg-surface/70 transition-[width,padding] duration-200 ease-out md:flex",
          historySidebarExpanded ? "w-72 p-4" : "w-[52px] items-center px-2 py-4",
        )}
      >
        {!historySidebarExpanded ? (
          <div className="flex flex-1 flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => persistHistorySidebarExpanded(true)}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-foreground transition-colors hover:bg-cream/60"
              aria-expanded={false}
              title={t.chat.expandHistorySidebar}
              aria-label={t.chat.expandHistorySidebar}
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => {
                createConversation();
                setInput("");
              }}
              className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark"
              title={t.chat.newConversationAria}
              aria-label={t.chat.newConversationAria}
            >
              <Plus className="size-4" aria-hidden />
            </button>
            <div className="flex flex-1 flex-col items-center pt-1">
              <History className="size-4 text-muted" aria-hidden />
            </div>
          </div>
        ) : (
          <>
            <div className="mb-4 flex items-start gap-2">
              <button
                type="button"
                onClick={() => persistHistorySidebarExpanded(false)}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl border border-border-light bg-surface text-foreground transition-colors hover:bg-cream/60"
                aria-expanded={true}
                aria-controls="chat-history-sidebar-panel"
                title={t.chat.collapseHistorySidebar}
                aria-label={t.chat.collapseHistorySidebar}
              >
                <ChevronLeft className="size-4" aria-hidden />
              </button>
              <div id="chat-history-sidebar-panel" className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <History className="size-4 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">{t.chat.sidebarTitle}</span>
                </h2>
                <p className="mt-1 text-xs text-muted">{t.chat.sidebarHint}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  createConversation();
                  setInput("");
                }}
                className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark"
                aria-label={t.chat.newConversationAria}
              >
                <Plus className="size-4" aria-hidden />
              </button>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
              {conversations.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-4 py-6 text-center text-xs text-muted">
                  {t.chat.emptyConversationsHint}
                </div>
              ) : (
                conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`group relative rounded-2xl border transition-colors ${
                      conversation.id === activeConversationId
                        ? "border-primary/40 bg-primary/10"
                        : "border-border-light bg-surface hover:bg-cream/50"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectConversation(conversation.id)}
                      className="w-full rounded-2xl px-3 py-3 pr-10 text-left"
                    >
                      <p className="truncate text-sm font-medium text-foreground">{conversation.title}</p>
                      <p className="mt-1 text-[11px] text-muted">
                        {t.chat.messagesCount.replace("{n}", String(conversation.messages.length))} ·{" "}
                        {new Date(conversation.updatedAt).toLocaleDateString("zh-TW")}
                      </p>
                    </button>
                    <button
                      type="button"
                      className="absolute right-2 top-1/2 z-[1] flex size-8 -translate-y-1/2 items-center justify-center rounded-lg text-red-600 opacity-0 transition-opacity hover:bg-red-500/10 group-hover:opacity-100"
                      aria-label={t.chat.deleteConversationAria}
                      onClick={(event) => {
                        event.stopPropagation();
                        void deleteConversation(conversation.id);
                      }}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </aside>

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border-light px-6 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-lavender to-primary">
                <Sparkles className="size-5 text-white" aria-hidden />
              </div>
              <div>
                <h1 className="font-semibold text-foreground">{t.chat.pageTitle}</h1>
                <p className="text-xs text-muted">{t.chat.pageSubtitle}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                createConversation();
                setInput("");
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-border-light bg-surface px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-cream/60 md:hidden"
            >
              <Plus className="size-3.5" aria-hidden />
              {t.chat.newConversation}
            </button>
          </div>
        </div>
        {conversations.length > 0 && (
          <div className="flex gap-2 overflow-x-auto border-b border-border-light px-4 py-3 md:hidden">
            {conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${
                  conversation.id === activeConversationId
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border-light bg-surface text-muted"
                }`}
              >
                {conversation.title}
              </button>
            ))}
          </div>
        )}

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-6">
          {messages.length === 0 && !isSending && !errorMessage && (
            <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-4 py-8 text-center text-sm text-muted">
              <p className="font-medium text-foreground">{t.chat.emptyTitle}</p>
              <p className="mt-2 text-xs">{emptyChatHint}</p>
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
                className={`flex max-w-[70%] items-end gap-2 ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
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
                        : "rounded-bl-md border border-border-light bg-surface text-foreground shadow-soft"
                    }`}
                  >
                    <MarkdownMessage
                      content={message.content}
                      inverted={message.role === "user"}
                    />
                  </div>
                  <p
                    className={`mt-1 text-[10px] text-muted ${
                      message.role === "user" ? "text-right" : ""
                    }`}
                  >
                    {message.timestamp}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}

          {isSending && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-lavender to-primary text-xs text-white">
                {t.chat.aiShort}
              </div>
              <div className="rounded-2xl rounded-bl-md border border-border-light bg-surface px-4 py-3 shadow-soft">
                <div className="flex items-center gap-1">
                  <div className="size-2 animate-bounce rounded-full bg-muted-light" style={{ animationDelay: "0ms" }} />
                  <div className="size-2 animate-bounce rounded-full bg-muted-light" style={{ animationDelay: "150ms" }} />
                  <div className="size-2 animate-bounce rounded-full bg-muted-light" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {errorMessage}
            </div>
          )}

          {(isLoadingVideos || videoError || recommendedVideos.length > 0) && (
            <section className="rounded-2xl border border-border-light bg-surface px-4 py-4 shadow-soft">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-foreground">AI 推薦影片</h2>
                {isLoadingVideos && (
                  <Loader2 className="size-4 animate-spin text-primary" aria-hidden />
                )}
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

        <div className="px-6 pb-6 pt-3">
          <div className="flex items-center gap-3 rounded-2xl border border-border-light bg-surface px-4 py-2 shadow-soft">
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleVoiceHint()}
              className="flex size-10 cursor-pointer items-center justify-center rounded-xl bg-lavender/10 text-lavender transition-colors hover:bg-lavender/20"
              aria-label={t.chat.voiceMapOnlyTitle}
              title={t.chat.voiceMapOnlyHint}
            >
              <Mic className="size-5" aria-hidden />
            </motion.button>

            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSend()}
              placeholder={t.chat.placeholder}
              data-testid="chat-input"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-foreground placeholder:text-muted-light focus:outline-none"
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

      <div className="hidden w-72 overflow-y-auto border-l border-border-light bg-surface/50 p-5 lg:block">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="size-4 text-lavender" aria-hidden />
          {t.chat.contextTitle}
        </h3>

        {planningSnapshot.hasPlanningContext ? (
          <div className="flex flex-col gap-3">
            {tagConfigs.map((tag, index) => {
              const Icon = tag.icon;
              return (
                <button
                  type="button"
                  key={tag.label}
                  onClick={() => router.push(index === 3 ? "/itinerary" : "/profile")}
                  className="flex w-full min-w-0 items-center gap-3 rounded-xl bg-primary/5 px-3 py-2.5 text-left transition-colors hover:bg-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/30"
                >
                  <Icon className="size-4 flex-shrink-0 text-primary" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted">{tag.label}</p>
                    <p className="truncate text-sm font-medium text-foreground">{extractedValues[index]}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border-light bg-cream/30 px-4 py-6 text-center">
            <p className="text-sm font-medium text-foreground">{t.chat.contextEmptyTitle}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted">{t.chat.contextEmptyBody}</p>
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-lavender/15 bg-gradient-to-br from-lavender/10 to-primary/10 p-4">
          <h4 className="mb-2 text-sm font-semibold text-foreground">{t.chat.planningNoteTitle}</h4>
          <p className="text-xs leading-relaxed text-muted">{t.chat.planningNoteBody}</p>
        </div>
      </div>

      <VideoSummaryDrawer
        video={selectedVideo}
        open={selectedVideo !== null}
        onClose={() => setSelectedVideo(null)}
      />
    </div>
  );
}
