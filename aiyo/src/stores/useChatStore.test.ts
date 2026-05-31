import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CHAT_REMOTE_CONVERSATION_ID,
  mergeRemoteWithLocalChatMessagesForTest,
  useChatStore,
} from "@/stores/useChatStore";
import type { ChatMessage } from "@/types";

describe("mergeRemoteWithLocalChatMessagesForTest", () => {
  it("dedupes duplicate local assistant replies with the same content", () => {
    const content = "可以，東京 3 天我先記下來。這趟幾個人一起去？";
    const remote: ChatMessage[] = [
      { id: "user_db", role: "user", content: "東京三天", timestamp: "03:06" },
    ];
    const local: ChatMessage[] = [
      { id: "user_local", role: "user", content: "東京三天", timestamp: "03:06" },
      {
        id: "assistant_1",
        role: "assistant",
        content,
        timestamp: "03:06",
        responseType: "question_card",
      },
      {
        id: "assistant_2",
        role: "assistant",
        content,
        timestamp: "03:06",
        responseType: "question_card",
      },
    ];

    const merged = mergeRemoteWithLocalChatMessagesForTest(remote, local);
    const assistantMessages = merged.filter((message) => message.role === "assistant");

    assert.equal(assistantMessages.length, 1);
    assert.equal(assistantMessages[0]?.content, content);
  });
});

describe("useChatStore remote sync guards", () => {
  it("skips mergeRemoteMessages while isSending is true", () => {
    const content = "可以，東京 3 天我先記下來。這趟幾個人一起去？";
    const localMessages: ChatMessage[] = [
      { id: "user_local", role: "user", content: "東京三天", timestamp: "03:06" },
      {
        id: "assistant_local",
        role: "assistant",
        content,
        timestamp: "03:06",
        responseType: "question_card",
      },
    ];
    useChatStore.setState({
      isSending: true,
      activeConversationId: CHAT_REMOTE_CONVERSATION_ID,
      messages: localMessages,
      conversations: [
        {
          id: CHAT_REMOTE_CONVERSATION_ID,
          title: "目前行程對話",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          messages: localMessages,
        },
      ],
    });

    useChatStore.getState().mergeRemoteMessages([
      { id: "user_db", role: "user", content: "東京三天", timestamp: "03:06" },
      {
        id: "assistant_db",
        role: "assistant",
        content,
        timestamp: "03:06",
        responseType: "question_card",
      },
    ]);

    assert.equal(useChatStore.getState().messages.length, 2);
    assert.equal(
      useChatStore.getState().messages.filter((message) => message.role === "assistant").length,
      1,
    );
  });
});
