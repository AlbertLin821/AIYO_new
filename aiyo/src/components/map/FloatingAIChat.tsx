"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, Send, Sparkles, X } from "lucide-react";
import { zhTW as t } from "@/locales/zh-TW";
import { sendChatMessage } from "@/services/aiClient";
import { useChatStore } from "@/stores/useChatStore";
import { useMapStore } from "@/stores/useMapStore";
import { useToastStore } from "@/stores/useToastStore";
import { useTripStore } from "@/stores/useTripStore";
import { useUIStore } from "@/stores/useUIStore";
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
  } = useChatStore();
  const tripStore = useTripStore();
  const pushToast = useToastStore((state) => state.pushToast);
  const [message, setMessage] = useState("");
  const rightOffset = panelOpen ? "min(404px, calc(100vw - 22rem))" : "24px";

  async function handleSend(nextMessage?: string) {
    const content = (nextMessage || message).trim();
    if (!content || isSending) {
      return;
    }

    const userMessage = buildUserMessage(content);
    appendMessage(userMessage);
    setMessage("");
    setErrorMessage(null);
    setIsSending(true);

    try {
      const response = await sendChatMessage({
        message: content,
        context: {
          destination: tripStore.destination,
          days: tripStore.days,
          budget: tripStore.budget,
          itinerary: tripStore.itinerary,
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
      className="absolute bottom-6 z-30 transition-[right] duration-300"
      style={{ right: rightOffset }}
    >
      <AnimatePresence>
        {chatBubbleOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="absolute bottom-16 right-0 w-96 bg-surface rounded-2xl shadow-soft-lg overflow-hidden border border-border-light"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-primary/10 to-lavender/10 border-b border-border-light">
              <div className="flex items-center gap-2">
                <div className="size-6 rounded-full bg-gradient-to-br from-primary to-lavender flex items-center justify-center">
                  <Sparkles className="size-3 text-white" />
                </div>
                <span className="text-sm font-semibold text-foreground">{t.floatingChat.title}</span>
              </div>
              <button
                onClick={() => setChatBubbleOpen(false)}
                className="p-1 rounded-lg text-muted hover:text-foreground hover:bg-surface/50 transition-colors cursor-pointer"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="h-72 overflow-y-auto p-3 flex flex-col gap-2.5">
              {messages.length === 0 && !isSending && !errorMessage && (
                <div className="rounded-xl border border-dashed border-border-light bg-cream/40 px-3 py-6 text-center text-xs text-muted">
                  <p className="font-medium text-foreground">{t.floatingChat.emptyTitle}</p>
                  <p className="mt-1 leading-relaxed">{t.floatingChat.emptyHint}</p>
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
                    className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                      chatMessage.role === "user"
                        ? "bg-primary text-white rounded-br-md"
                        : "bg-cream border border-border-light text-foreground rounded-bl-md"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{chatMessage.content}</p>
                  </div>
                </div>
              ))}
              {isSending && <div className="text-xs text-muted">{t.floatingChat.aiThinking}</div>}
              {errorMessage && (
                <div className="rounded-xl bg-danger/10 px-3 py-2 text-xs text-danger">
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="px-3 pb-2 flex gap-1.5 flex-wrap">
              {quickReplies.map((reply) => (
                <button
                  key={reply}
                  onClick={() => setMessage(reply)}
                  className="px-2.5 py-1 bg-primary/8 text-primary text-[11px] rounded-full hover:bg-primary/15 transition-colors cursor-pointer"
                >
                  {reply}
                </button>
              ))}
            </div>

            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 bg-cream/50 rounded-xl border border-border-light px-3 py-1.5">
                <input
                  type="text"
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && void handleSend()}
                  placeholder={t.floatingChat.placeholder}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-light focus:outline-none py-1"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={!message.trim() || isSending}
                  className="p-1.5 rounded-lg text-primary hover:bg-primary/10 transition-colors cursor-pointer disabled:opacity-30"
                >
                  <Send className="size-4" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setChatBubbleOpen(!chatBubbleOpen)}
        className={`size-12 rounded-full shadow-soft-lg flex items-center justify-center cursor-pointer transition-colors ${
          chatBubbleOpen
            ? "bg-primary text-white"
            : "bg-surface text-primary hover:bg-primary/5 border border-border-light"
        }`}
      >
        <MessageCircle className="size-5" />
      </motion.button>
    </div>
  );
}
