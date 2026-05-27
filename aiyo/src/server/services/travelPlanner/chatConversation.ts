import { CHAT_HISTORY_WINDOW } from "@/lib/chatConstants";
import type { OllamaMessage } from "@/server/ai/ollamaClient";
import type { ChatMessage } from "@/types";

export function normalizeConversationHistory(messages?: ChatMessage[]): OllamaMessage[] {
  if (!messages?.length) {
    return [];
  }

  return messages
    .filter((message) => message.role === "user" || message.role === "assistant" || message.role === "ai")
    .slice(-CHAT_HISTORY_WINDOW)
    .map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));
}
