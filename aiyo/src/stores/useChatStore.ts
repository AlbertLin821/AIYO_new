import { create } from "zustand";
import type { ChatMessage } from "@/types";

interface ChatState {
  messages: ChatMessage[];
  isSending: boolean;
  errorMessage: string | null;
  setMessages: (messages: ChatMessage[]) => void;
  mergeRemoteMessages: (messages: ChatMessage[]) => void;
  appendMessage: (message: ChatMessage) => void;
  setIsSending: (isSending: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  clearMessages: () => void;
}

function messageSignature(message: ChatMessage): string {
  return `${message.role}:${message.content.trim().toLowerCase()}`;
}

function isEphemeralMessage(message: ChatMessage): boolean {
  return /^(chat_user_|user_|voice_user_)/.test(message.id);
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isSending: false,
  errorMessage: null,
  setMessages: (messages) => set({ messages }),
  mergeRemoteMessages: (messages) =>
    set((state) => {
      const remoteSignatures = new Set(messages.map(messageSignature));
      const pendingLocal = state.messages.filter(
        (message) =>
          isEphemeralMessage(message) && !remoteSignatures.has(messageSignature(message)),
      );
      return { messages: [...messages, ...pendingLocal] };
    }),
  appendMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),
  setIsSending: (isSending) => set({ isSending }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  clearMessages: () => set({ messages: [] }),
}));
