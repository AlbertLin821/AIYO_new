import { getSession } from "next-auth/react";
import { create } from "zustand";
import { zhTW as t } from "@/locales/zh-TW";
import { clearPersistedChatHistoryOnServer } from "@/services/chatHistoryClient";
import { withSyncMutationSource } from "@/stores/syncMutationSource";
import { useToastStore } from "@/stores/useToastStore";
import type { ChatMessage } from "@/types";

/** Bootstrap／`/api/ai/chat` 持久化對話在商店中的固定識別 */
export const CHAT_REMOTE_CONVERSATION_ID = "remote-current-trip";

export function getRemoteConversationId(tripId?: string | null): string {
  const normalizedTripId = tripId?.trim();
  return normalizedTripId ? `remote-trip-${normalizedTripId}` : CHAT_REMOTE_CONVERSATION_ID;
}

function isSyncedRemoteConversation(conversation: ChatConversation): boolean {
  return conversation.id === getRemoteConversationId(conversation.tripId);
}

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
  setConversationTrip: (conversationId: string, tripId: string) => void;
  selectConversation: (conversationId: string) => void;
  deleteConversation: (conversationId: string) => Promise<void>;
  setMessages: (
    messages: ChatMessage[],
    trip?: { tripId?: string | null; title?: string | null },
    options?: { force?: boolean },
  ) => void;
  mergeRemoteMessages: (messages: ChatMessage[], trip?: { tripId?: string | null; title?: string | null }) => void;
  appendMessage: (message: ChatMessage) => void;
  removeMessageById: (messageId: string) => void;
  clearProposedChangesForMessage: (messageId: string) => void;
  setIsSending: (isSending: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  clearMessages: () => void;
}

export function messageSignature(message: ChatMessage): string {
  return `${message.role}:${message.content.trim().toLowerCase()}`;
}

function dedupeChatMessagesBySignature(messages: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  const deduped: ChatMessage[] = [];
  for (const message of messages) {
    const signature = messageSignature(message);
    if (seen.has(signature)) {
      continue;
    }
    seen.add(signature);
    deduped.push(message);
  }
  return deduped;
}

function isEphemeralMessage(message: ChatMessage): boolean {
  return /^(chat_user_|user_|voice_user_)/.test(message.id);
}

function hasStructuredChatPayload(message: ChatMessage): boolean {
  return Boolean(
      message.travelPlan ||
      message.questionCard ||
      message.preferenceConfirmation ||
      message.responseType === "travel_plan" ||
      message.responseType === "question_card" ||
      (message.proposedChanges?.length ?? 0) > 0 ||
      (message.assistantActions?.length ?? 0) > 0 ||
      (message.sourceReferences?.length ?? 0) > 0,
  );
}

function mergeStructuredChatFields(remote: ChatMessage, local: ChatMessage): ChatMessage {
  if (!hasStructuredChatPayload(local)) {
    return remote;
  }
  return {
    ...remote,
    responseType: local.responseType ?? remote.responseType,
    travelPlan: local.travelPlan ?? remote.travelPlan,
    questionCard: local.questionCard ?? remote.questionCard,
    preferenceConfirmation: local.preferenceConfirmation ?? remote.preferenceConfirmation,
    statusSteps: local.statusSteps?.length ? local.statusSteps : remote.statusSteps,
    tripProfile: local.tripProfile ?? remote.tripProfile,
    proposedChanges: local.proposedChanges ?? remote.proposedChanges,
    assistantActions: local.assistantActions ?? remote.assistantActions,
    sourceReferences: local.sourceReferences ?? remote.sourceReferences,
    sources: local.sources ?? remote.sources,
  };
}

function mergeRemoteWithLocalChatMessages(
  remoteMessages: ChatMessage[],
  localMessages: ChatMessage[],
): ChatMessage[] {
  const localById = new Map(localMessages.map((message) => [message.id, message]));
  const localBySignature = new Map(localMessages.map((message) => [messageSignature(message), message]));

  const mergedRemote = remoteMessages.map((remoteMessage) => {
    const localMatch =
      localById.get(remoteMessage.id) ||
      localBySignature.get(messageSignature(remoteMessage));
    return localMatch ? mergeStructuredChatFields(remoteMessage, localMatch) : remoteMessage;
  });

  const remoteSignatures = new Set(remoteMessages.map(messageSignature));
  const pendingLocal = localMessages.filter(
    (message) =>
      (isEphemeralMessage(message) || hasStructuredChatPayload(message)) &&
      !remoteSignatures.has(messageSignature(message)),
  );

  return dedupeChatMessagesBySignature([...mergedRemote, ...pendingLocal]);
}

/** @internal Exported for unit tests */
export function mergeRemoteWithLocalChatMessagesForTest(
  remoteMessages: ChatMessage[],
  localMessages: ChatMessage[],
): ChatMessage[] {
  return mergeRemoteWithLocalChatMessages(remoteMessages, localMessages);
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatTripConversationTitle(title?: string | null): string | null {
  const trimmed = title?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.endsWith("對話") ? trimmed : `${trimmed}對話`;
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
  trip?: { tripId?: string | null; title?: string | null },
): ChatConversation[] {
  const updatedAt = nowIso();
  const remoteId = getRemoteConversationId(trip?.tripId);
  const existing = conversations.find((conversation) => conversation.id === remoteId);
  const fallbackTitle = formatTripConversationTitle(trip?.title);
  const remoteConversation: ChatConversation = {
    id: remoteId,
    title: fallbackTitle || deriveConversationTitle(remoteMessages, "目前行程對話"),
    createdAt: existing?.createdAt || updatedAt,
    updatedAt,
    messages: remoteMessages,
    tripId: trip?.tripId?.trim() || existing?.tripId,
  };

  return [
    remoteConversation,
    ...conversations.filter((conversation) => conversation.id !== remoteId),
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
  setConversationTrip: (conversationId, tripId) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => ({
        conversations: state.conversations.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                tripId,
                updatedAt: nowIso(),
              }
            : conversation,
        ),
      }));
    }),
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
  setMessages: (messages, trip, options) =>
    set((state) => {
      if (state.isSending) {
        return state;
      }
      const remoteId = getRemoteConversationId(trip?.tripId);
      const activeConversation = state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      if (activeConversation?.tripId && !isSyncedRemoteConversation(activeConversation) && !options?.force) {
        return {
          conversations: state.conversations.filter(
            (conversation) => conversation.id !== remoteId,
          ),
          activeConversationId: activeConversation.id,
          messages: activeConversation.messages,
        };
      }

      const conversations = upsertRemoteConversation(state.conversations, messages, trip);
      const activeConversationId = state.activeConversationId || remoteId;
      const nextActiveConversation = conversations.find((item) => item.id === activeConversationId);
      return {
        conversations,
        activeConversationId,
        messages: nextActiveConversation?.messages || messages,
      };
    }),
  mergeRemoteMessages: (messages, trip) =>
    set((state) => {
      if (state.isSending) {
        return state;
      }
      const remoteId = getRemoteConversationId(trip?.tripId);
      const activeConversation = state.conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      if (activeConversation?.tripId && !isSyncedRemoteConversation(activeConversation)) {
        return {
          conversations: state.conversations.filter(
            (conversation) => conversation.id !== remoteId,
          ),
          messages: activeConversation.messages,
        };
      }

      const remoteConversation = state.conversations.find(
        (conversation) => conversation.id === remoteId,
      );
      const localMessages = dedupeChatMessagesBySignature([
        ...(remoteConversation?.messages || []),
        ...(state.activeConversationId === remoteId ? state.messages : []),
      ]);
      const mergedMessages = mergeRemoteWithLocalChatMessages(messages, localMessages);
      const conversations = upsertRemoteConversation(state.conversations, mergedMessages, trip);
      const nextActiveConversation = conversations.find(
        (conversation) => conversation.id === state.activeConversationId,
      );
      const nextMessages =
        state.activeConversationId === remoteId
          ? mergedMessages
          : nextActiveConversation?.messages || state.messages;
      return {
        conversations,
        messages: nextMessages,
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
          const signature = messageSignature(message);
          const isDuplicateAssistant =
            message.role === "assistant" &&
            existingConversation.messages.some(
              (existingMessage) =>
                existingMessage.role === "assistant" &&
                messageSignature(existingMessage) === signature,
            );
          if (isDuplicateAssistant) {
            return {
              conversations: state.conversations,
              activeConversationId: state.activeConversationId || activeId,
              messages: state.messages,
            };
          }
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
  removeMessageById: (messageId) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        const strip = (messages: ChatMessage[]) =>
          messages.filter((message) => message.id !== messageId);
        return {
          messages: strip(state.messages),
          conversations: state.conversations.map((conversation) =>
            conversation.id === state.activeConversationId
              ? { ...conversation, messages: strip(conversation.messages) }
              : conversation,
          ),
        };
      });
    }),
  clearProposedChangesForMessage: (messageId) =>
    withSyncMutationSource("local-user-edit", () => {
      set((state) => {
        const stripProposedChanges = (messages: ChatMessage[]) =>
          messages.map((message) =>
            message.id === messageId ? { ...message, proposedChanges: undefined } : message,
          );
        return {
          messages: stripProposedChanges(state.messages),
          conversations: state.conversations.map((conversation) =>
            conversation.id === state.activeConversationId
              ? { ...conversation, messages: stripProposedChanges(conversation.messages) }
              : conversation,
          ),
        };
      });
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
