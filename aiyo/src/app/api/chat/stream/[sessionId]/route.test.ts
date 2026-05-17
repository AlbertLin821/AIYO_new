import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/chat/stream/[sessionId]/route";
import { completeChatProgress, ensureChatProgressSession, publishChatProgress } from "@/server/chat/chatProgressStore";

test("GET /api/chat/stream/:sessionId returns SSE status stream", async () => {
  ensureChatProgressSession("session_1");
  publishChatProgress("session_1", {
    type: "status_step",
    phase: "understand",
    label: "整理行程需求",
    status: "completed",
  });
  publishChatProgress("session_1", {
    type: "status_step",
    phase: "research",
    label: "搜尋景點、交通與美食資訊",
    status: "completed",
  });
  completeChatProgress("session_1");

  const response = await GET(
    new Request("http://localhost/api/chat/stream/session_1"),
    { params: Promise.resolve({ sessionId: "session_1" }) },
  );

  assert.equal(response.headers.get("content-type"), "text/event-stream; charset=utf-8");

  const body = await response.text();
  assert.match(body, /event: status_step/);
  assert.match(body, /整理行程需求/);
  assert.match(body, /搜尋景點、交通與美食資訊/);
});
