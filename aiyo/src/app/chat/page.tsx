"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { motion } from "framer-motion";
import {
  CalendarDays,
  DollarSign,
  Heart,
  Loader2,
  MapPin,
  Mic,
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
  const { status } = useSession();
  const [input, setInput] = useState("");
  const { messages, appendMessage, isSending, setIsSending, errorMessage, setErrorMessage } =
    useChatStore();
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

    appendMessage(buildUserMessage(message));
    setInput("");
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        message,
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
      <div className="flex-1 flex flex-col">
        <div className="px-6 py-4 border-b border-border-light">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-gradient-to-br from-lavender to-primary flex items-center justify-center">
              <Sparkles className="size-5 text-white" />
            </div>
            <div>
              <h1 className="font-semibold text-foreground">{t.chat.pageTitle}</h1>
              <p className="text-xs text-muted">{t.chat.pageSubtitle}</p>
            </div>
          </div>
        </div>

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
                <div
                  key={tag.label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-primary/5"
                >
                  <Icon className="size-4 flex-shrink-0 text-primary" />
                  <div>
                    <p className="text-[11px] text-muted">{tag.label}</p>
                    <p className="text-sm font-medium">{extractedValues[index]}</p>
                  </div>
                </div>
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
