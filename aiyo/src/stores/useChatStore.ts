import { getSession } from "next-auth/react";
import { create } from "zustand";
import { zhTW as t } from "@/locales/zh-TW";
import { clearPersistedChatHistoryOnServer } from "@/services/chatHistoryClient";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import type { ChatMessage } from "@/types";

/** Bootstrap／`/api/ai/chat` 持久化對話在商店中的固定識別 */
export const CHAT_REMOTE_CONVERSATION_ID = "remote-current-trip";

export interface ChatConversation {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
  tripId?: string;
}

interface ChatState {
  conversations: ChatConversation[];
  activeConversationId: string | null;
  messages: ChatMessage[];
  isSending: boolean;
  errorMessage: string | null;
  createConversation: (title?: string, tripId?: string) => string;
  selectConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
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

function nowIso(): string {
  return new Date().toISOString();
}

function deriveConversationTitle(messages: ChatMessage[], fallback = "新的對話"): string {
  const firstUserMessage = messages.find((message) => message.role === "user");
  const content = (firstUserMessage?.content || messages[0]?.content || fallback).trim();
  return content.length > 22 ? `${content.slice(0, 22)}...` : content;
}

function createEmptyConversation(title = "新的對話", tripId?: string): ChatConversation {
  const createdAt = nowIso();
  return {
    id: `conversation_${Date.now()}`,
    title: title.trim() || "新的對話",
    createdAt,
    updatedAt: createdAt,
    messages: [],
    tripId,
  };
}

function upsertRemoteConversation(
  conversations: ChatConversation[],
  remoteMessages: ChatMessage[],
): ChatConversation[] {
  const updatedAt = nowIso();
  const existing = conversations.find((conversation) => conversation.id === CHAT_REMOTE_CONVERSATION_ID);
  const remoteConversation: ChatConversation = {
    id: CHAT_REMOTE_CONVERSATION_ID,
    title: deriveConversationTitle(remoteMessages, "目前行程對話"),
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
    messages: remoteMessages,
    tripId: existing?.tripId,
  };

  return [
    remoteConversation,
    ...conversations.filter((conversation) => conversation.id !== CHAT_REMOTE_CONVERSATION_ID),
  ];
}

export const useChatStore = create<ChatState>((set) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  isSending: false,
  errorMessage: null,
  createConversation: (title, tripId) => {
    const conversation = createEmptyConversation(title, tripId);
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        conversations: [conversation, ...state.conversations],
        activeConversationId: conversation.id,
        messages: [],
        errorMessage: null,
      }));
    });
    return conversation.id;
  },
  selectConversation: (conversationId) =>
    set((state) => {
      const conversation = state.conversations.find((item) => item.id === conversationId);
      if (!conversation) {
        return state;
      }
      return {
        activeConversationId: conversation.id,
        messages: conversation.messages,
        errorMessage: null,
      };
    }),
  deleteConversation: async (conversationId) => {
    const prevConversations = useChatStore.getState().conversations;
    const remaining = prevConversations.filter((item) => item.id !== conversationId);
    const clearServer =
      conversationId === CHAT_REMOTE_CONVERSATION_ID || remaining.length === 0;

    if (clearServer) {
      const session = await getSession();
      if (session?.user) {
        try {
          await clearPersistedChatHistoryOnServer();
        } catch {
          useToastStore.getState().pushToast({
            variant: "error",
            title: t.chat.deleteSyncedHistoryFailedTitle,
            description: t.chat.deleteSyncedHistoryFailedDesc,
          });
          return;
        }
      }
    }

    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        const conversations = state.conversations.filter((item) => item.id !== conversationId);
        const nextActive =
          state.activeConversationId === conversationId
            ? conversations[0]?.id || null
            : state.activeConversationId;
        const activeConversation = conversations.find((item) => item.id === nextActive);
        return {
          conversations,
          activeConversationId: nextActive,
          messages: activeConversation?.messages || [],
        };
      });
    });
  },
  setMessages: (messages) =>
    set((state) => {
      const activeConversation = state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      if (activeConversation?.tripId && activeConversation.id !== CHAT_REMOTE_CONVERSATION_ID) {
        return {
          conversations: state.conversations.filter(
            (conversation) => conversation.id !== CHAT_REMOTE_CONVERSATION_ID,
          ),
          activeConversationId: activeConversation.id,
          messages: activeConversation.messages,
        };
      }

      const conversations = upsertRemoteConversation(state.conversations, messages);
      const activeConversationId = state.activeConversationId || CHAT_REMOTE_CONVERSATION_ID;
      const nextActiveConversation = conversations.find((item) => item.id === activeConversationId);
      return {
        conversations,
        activeConversationId,
        messages: nextActiveConversation?.messages || messages,
      };
    }),
  mergeRemoteMessages: (messages) =>
    set((state) => {
      const activeConversation = state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      if (activeConversation?.tripId && activeConversation.id !== CHAT_REMOTE_CONVERSATION_ID) {
        return {
          conversations: state.conversations.filter(
            (conversation) => conversation.id !== CHAT_REMOTE_CONVERSATION_ID,
          ),
          messages: activeConversation.messages,
        };
      }

      const remoteSignatures = new Set(messages.map(messageSignature));
      const remoteConversation = state.conversations.find(
        (conversation) => conversation.id === CHAT_REMOTE_CONVERSATION_ID,
      );
      const pendingLocal = (remoteConversation?.messages || []).filter(
        (message) =>
          isEphemeralMessage(message) && !remoteSignatures.has(messageSignature(message)),
      );
      const mergedMessages = [...messages, ...pendingLocal];
      const conversations = upsertRemoteConversation(state.conversations, mergedMessages);
      const nextActiveConversation = conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      return {
        conversations,
        messages:
          state.activeConversationId === CHAT_REMOTE_CONVERSATION_ID
            ? mergedMessages
            : nextActiveConversation?.messages || state.messages,
      };
    }),
  appendMessage: (message) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        ...(() => {
          const activeId = state.activeConversationId || createEmptyConversation().id;
          const existingConversation =
            state.conversations.find((conversation) => conversation.id === activeId) ||
            ({
              ...createEmptyConversation(),
              id: activeId,
            } satisfies ChatConversation);
          const messages = [...existingConversation.messages, message];
          const updatedConversation: ChatConversation = {
            ...existingConversation,
            title:
              existingConversation.title === "新的對話"
                ? deriveConversationTitle(messages)
                : existingConversation.title,
            updatedAt: nowIso(),
            messages,
          };
          return {
            conversations: [
              updatedConversation,
              ...state.conversations.filter((conversation) => conversation.id !== activeId),
            ],
            activeConversationId: activeId,
            messages,
          };
        })(),
      }));
    }),
  setIsSending: (isSending) => set({ isSending }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  clearMessages: () =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        if (!state.activeConversationId) {
          return { messages: [] };
        }
        return {
          messages: [],
          conversations: state.conversations.map((conversation) =>
            conversation.id === state.activeConversationId
              ? {
                  ...conversation,
                  title: "新的對話",
                  updatedAt: nowIso(),
                  messages: [],
                }
              : conversation,
          ),
        };
      });
    }),
}));
