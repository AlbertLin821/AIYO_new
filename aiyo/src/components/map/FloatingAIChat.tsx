"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Plus, Send, Sparkles, X } from "lucide-react";
import MarkdownMessage from "@/components/chat/MarkdownMessage";
import { zhTW as t } from "@/locales/zh-TW";
import {
  applyPlanningUpdateToStores,
  derivePlanningSnapshot,
  extractIsoDateRangeFromText,
  extractPlanningUpdateFromText,
} from "@/lib/planningContext";
import { sendChatMessage } from "@/services/aiClient";
import { useChatStore } from "@/stores/useChatStore";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
import { useUserStore } from "@/stores/useUserStore";
import type { ChatMessage } from "@/types";

const quickReplies = [
  t.floatingChat.quick1,
  t.floatingChat.quick2,
  t.floatingChat.quick3,
  t.floatingChat.quick4,
];

function buildUserMessage(message: string): ChatMessage {
  return {
    id: `user_${Date.now()}`,
    role: "user",
    content: message,
    timestamp: new Date().toLocaleTimeString("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

export default function FloatingAIChat() {
  const { chatBubbleOpen, setChatBubbleOpen } = useUIStore();
  const panelOpen = useMapStore((state) => state.panelOpen);
  const {
    messages,
    appendMessage,
    isSending,
    setIsSending,
    errorMessage,
    setErrorMessage,
    createConversation,
  } = useChatStore();
  const tripStore = useTripStore();
  const userStore = useUserStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [message, setMessage] = useState("");
  const rightOffset = panelOpen ? "min(404px, calc(100vw - 22rem))" : "24px";
  const planningSnapshot = derivePlanningSnapshot({
    trip: tripStore,
    user: userStore,
    pinCount: useMapStore.getState().pins.length,
  });

  function handleNewConversation() {
    createConversation();
    setMessage("");
    setErrorMessage(null);
  }

  async function handleSend(nextMessage?: string) {
    const content = (nextMessage || message).trim();
    if (!content || isSending) {
      return;
    }

    applyPlanningUpdateToStores(extractPlanningUpdateFromText(content));

    const nextPlanningSnapshot = derivePlanningSnapshot({
      trip: useTripStore.getState(),
      user: useUserStore.getState(),
      pinCount: useMapStore.getState().pins.length,
    });
    const dateRange = extractIsoDateRangeFromText(content);

    const userMessage = buildUserMessage(content);
    appendMessage(userMessage);
    setMessage("");
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        message: content,
        context: {
          destination: nextPlanningSnapshot.destination,
          days: nextPlanningSnapshot.days,
          budget: nextPlanningSnapshot.budget,
          itinerary: useTripStore.getState().itinerary,
          tripStartDate: dateRange.tripStartDate,
          tripEndDate: dateRange.tripEndDate,
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
        action: () => void handleSend(content),
      });
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div
      className="absolute bottom-6 z-30 max-lg:bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] transition-[right,bottom] duration-300"
      style={{ right: rightOffset }}
    >
      <AnimatePresence>
        {chatBubbleOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-16 right-0 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-border-light bg-surface shadow-soft-lg"
          >
            <div className="border-b border-border-light bg-gradient-to-r from-primary/10 to-lavender/10 px-4 py-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-lavender">
                    <Sparkles className="size-3 text-white" aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <span className="text-sm font-semibold text-foreground">{t.floatingChat.title}</span>
                    <p className="mt-0.5 text-[10px] leading-snug text-muted">
                      {t.floatingChat.sharedRecordHint}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleNewConversation()}
                    className="cursor-pointer rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10"
                    aria-label={t.floatingChat.newConversationAria}
                    title={t.floatingChat.newConversation}
                  >
                    <Plus className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => setChatBubbleOpen(false)}
                    className="cursor-pointer rounded-lg p-1 text-muted transition-colors hover:bg-surface/50 hover:text-foreground"
                    aria-label={t.floatingChat.closeBubbleAria}
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>
              </div>
            </div>

            <div className="flex h-72 flex-col gap-2.5 overflow-y-auto p-3">
              {messages.length === 0 && !isSending && !errorMessage && (
                <div className="rounded-xl border border-dashed border-border-light bg-cream/40 px-3 py-6 text-center text-xs text-muted">
                  <p className="font-medium text-foreground">{t.floatingChat.emptyTitle}</p>
                  <p className="mt-1 leading-relaxed">
                    {planningSnapshot.hasPlanningContext
                      ? t.floatingChat.emptyHint
                      : t.floatingChat.emptyHintNoContext}
                  </p>
                </div>
              )}
              {messages.map((chatMessage) => (
                <div
                  key={chatMessage.id}
                  className={`flex ${
                    chatMessage.role === "user" ? "justify-end" : "justify-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                      chatMessage.role === "user"
                        ? "rounded-br-md bg-primary text-white"
                        : "rounded-bl-md border border-border-light bg-cream text-foreground"
                    }`}
                  >
                    <MarkdownMessage
                      content={chatMessage.content}
                      inverted={chatMessage.role === "user"}
                    />
                    {chatMessage.role !== "user" && (chatMessage.sources || []).length > 0 && (
                      <div className="mt-2 space-y-1 text-[11px] text-muted">
                        {(chatMessage.sources || []).slice(0, 2).map((source) => (
                          <p key={`${chatMessage.id}_${source.url}`}>
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
                  </div>
                </div>
              ))}
              {isSending && <div className="text-xs text-muted">{t.floatingChat.aiThinking}</div>}
              {errorMessage && (
                <div className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">{errorMessage}</div>
              )}
            </div>

            <div className="px-3 pb-2">
              <p className="mb-1.5 text-[10px] leading-snug text-muted">{t.floatingChat.quickReplyHelper}</p>
              <div className="flex flex-wrap gap-1.5">
                {quickReplies.map((reply) => (
                  <button
                    key={reply}
                    type="button"
                    onClick={() => setMessage(reply)}
                    className="cursor-pointer rounded-full bg-primary/8 px-2.5 py-1 text-[11px] text-primary transition-colors hover:bg-primary/15"
                  >
                    {reply}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 rounded-xl border border-border-light bg-cream/50 px-3 py-1.5">
                <input
                  type="text"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void handleSend()}
                  placeholder={t.floatingChat.placeholder}
                  className="min-w-0 flex-1 bg-transparent py-1 text-sm text-foreground placeholder:text-muted-light focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!message.trim() || isSending}
                  aria-label={t.floatingChat.sendAria}
                  className="cursor-pointer rounded-lg p-1.5 text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <Send className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setChatBubbleOpen(!chatBubbleOpen)}
        aria-label={chatBubbleOpen ? t.floatingChat.closeBubbleAria : t.floatingChat.openBubbleAria}
        aria-expanded={chatBubbleOpen}
        className={`flex size-12 cursor-pointer items-center justify-center rounded-full shadow-soft-lg transition-colors ${
          chatBubbleOpen
            ? "bg-primary text-white"
            : "border border-border-light bg-surface text-primary hover:bg-primary/5"
        }`}
      >
        <MessageCircle className="size-5" aria-hidden />
      </motion.button>
    </div>
  );
}
