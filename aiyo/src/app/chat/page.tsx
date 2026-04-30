"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  DollarSign,
  Heart,
  History,
  Loader2,
  MapPin,
  Mic,
  Plus,
  Send,
  Sparkles,
} from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { applyPlanningUpdateToStores, derivePlanningSnapshot, extractPlanningUpdateFromText } from "@/lib/planningContext";
import { sendChatMessage } from "@/services/aiClient";
import { useChatStore } from "@/stores/useChatStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";
import type { ChatMessage } from "@/types";

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

export default function ChatPage() {
  const router = useRouter();
  const { status } = useSession();
  const [input, setInput] = useState("");
  const {
    conversations,
    activeConversationId,
    messages,
    createConversation,
    selectConversation,
    appendMessage,
    isSending,
    setIsSending,
    errorMessage,
    setErrorMessage,
  } = useChatStore();
  const tripStore = useTripStore();
  const userStore = useUserStore();
  const { voiceState, setVoiceState } = useUIStore();
  const pushToast = useToastStore((state) => state.pushToast);

  const tagConfigs = [
    { icon: MapPin, label: t.chat.tagDestination },
    { icon: CalendarDays, label: t.chat.tagDays },
    { icon: DollarSign, label: t.chat.tagBudget },
    { icon: Heart, label: "\u884c\u7a0b" },
  ];

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

  function handleVoiceToggle() {
    if (voiceState !== "idle") {
      setVoiceState("idle");
      return;
    }

    setVoiceState("listening");
    window.setTimeout(() => {
      setVoiceState("idle");
      pushToast({
        variant: "info",
        title: t.chat.voiceUnavailableTitle,
        description: t.chat.voiceUnavailable,
      });
    }, 400);
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
      ? `${planningSnapshot.plannedStopCount} \u500b\u5df2\u898f\u5283\u505c\u9760\u9ede`
      : t.chat.valueUnset,
  ];

  const emptyChatHint =
    status === "authenticated" ? t.chat.emptyHintAuthed : t.chat.emptyHintGuest;

  return (
    <div className="h-screen flex">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-border-light bg-surface/70 p-4 md:flex">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <History className="size-4 text-primary" />
              對話紀錄
            </h2>
            <p className="mt-1 text-xs text-muted">新增對話並切換歷史紀錄。</p>
          </div>
          <button
            type="button"
            onClick={() => {
              createConversation();
              setInput("");
            }}
            className="flex size-9 items-center justify-center rounded-xl bg-primary text-white transition-colors hover:bg-primary-dark"
            aria-label="新增對話"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
          {conversations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border-light bg-cream/40 px-4 py-6 text-center text-xs text-muted">
              尚無歷史對話。送出第一則訊息後會自動建立。
            </div>
          ) : (
            conversations.map((conversation) => (
              <button
                type="button"
                key={conversation.id}
                onClick={() => selectConversation(conversation.id)}
                className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                  conversation.id === activeConversationId
                    ? "border-primary/40 bg-primary/10"
                    : "border-border-light bg-surface hover:bg-cream/50"
                }`}
              >
                <p className="truncate text-sm font-medium text-foreground">{conversation.title}</p>
                <p className="mt-1 text-[11px] text-muted">
                  {conversation.messages.length} 則訊息 ·{" "}
                  {new Date(conversation.updatedAt).toLocaleDateString("zh-TW")}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-border-light">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-gradient-to-br from-lavender to-primary flex items-center justify-center">
                <Sparkles className="size-5 text-white" />
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
              <Plus className="size-3.5" />
              新增對話
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

        <div className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4">
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
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`flex items-end gap-2 max-w-[70%] ${
                  message.role === "user" ? "flex-row-reverse" : ""
                }`}
              >
                <div
                  className={`size-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-xs font-bold ${
                    message.role === "user"
                      ? "bg-gradient-to-br from-secondary to-primary"
                      : "bg-gradient-to-br from-lavender to-primary"
                  }`}
                >
                  {message.role === "user" ? t.chat.userShort : t.chat.aiShort}
                </div>

                <div>
                  <div
                    className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                      message.role === "user"
                        ? "bg-primary text-white rounded-br-md"
                        : "bg-surface border border-border-light text-foreground rounded-bl-md shadow-soft"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                  </div>
                  <p
                    className={`text-[10px] text-muted mt-1 ${
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
              <div className="size-8 rounded-full bg-gradient-to-br from-lavender to-primary flex items-center justify-center text-xs text-white">
                {t.chat.aiShort}
              </div>
              <div className="px-4 py-3 bg-surface border border-border-light rounded-2xl rounded-bl-md shadow-soft">
                <div className="flex items-center gap-1">
                  <div className="size-2 rounded-full bg-muted-light animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="size-2 rounded-full bg-muted-light animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="size-2 rounded-full bg-muted-light animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </motion.div>
          )}

          {errorMessage && (
            <div className="rounded-2xl border border-danger/20 bg-danger/10 px-4 py-3 text-sm text-danger">
              {errorMessage}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3">
          <div className="flex items-center gap-3 bg-surface rounded-2xl border border-border-light shadow-soft px-4 py-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => void handleVoiceToggle()}
              className={`size-10 rounded-xl flex items-center justify-center cursor-pointer transition-colors ${
                voiceState === "listening"
                  ? "bg-lavender text-white"
                  : "bg-lavender/10 text-lavender hover:bg-lavender/20"
              }`}
            >
              {voiceState === "listening" ? (
                <Loader2 className="size-5 animate-spin" />
              ) : (
                <Mic className="size-5" />
              )}
            </motion.button>

            <input
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && void handleSend()}
              placeholder={t.chat.placeholder}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-light focus:outline-none py-2"
            />

            <button
              onClick={() => void handleSend()}
              disabled={!input.trim() || isSending}
              className="size-10 rounded-xl bg-primary text-white flex items-center justify-center cursor-pointer hover:bg-primary-dark transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="w-72 border-l border-border-light bg-surface/50 p-5 overflow-y-auto hidden lg:block">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Sparkles className="size-4 text-lavender" />
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
                  <Icon className="size-4 flex-shrink-0 text-primary" />
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
            <p className="mt-2 text-xs text-muted leading-relaxed">{t.chat.contextEmptyBody}</p>
          </div>
        )}

        <div className="mt-6 p-4 bg-gradient-to-br from-lavender/10 to-primary/10 rounded-2xl border border-lavender/15">
          <h4 className="text-sm font-semibold text-foreground mb-2">{t.chat.planningNoteTitle}</h4>
          <p className="text-xs text-muted leading-relaxed">{t.chat.planningNoteBody}</p>
        </div>
      </div>
    </div>
  );
}
