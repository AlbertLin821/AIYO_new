import test from "node:test";
import assert from "node:assert/strict";
import { GET } from "@/app/api/chat/stream/[sessionId]/route";
import {
  canAccessChatProgressSession,
  completeChatProgress,
  ensureChatProgressSession,
  publishChatProgress,
} from "@/server/chat/chatProgressStore";

test("GET /api/chat/stream/:sessionId requires authentication", async () => {
  const response = await GET(
    new Request("http://localhost/api/chat/stream/session_1"),
    { params: Promise.resolve({ sessionId: "session_1" }) },
  );
  assert.equal(response.status, 401);
});

test("chat progress store publishes steps for owned session", () => {
  ensureChatProgressSession("session_owned", "user_test");
  assert.equal(canAccessChatProgressSession("session_owned", "user_test"), true);
  assert.equal(canAccessChatProgressSession("session_owned", "other_user"), false);

  publishChatProgress("session_owned", {
    type: "status_step",
    phase: "understand",
    label: "整理行程需求",
    status: "completed",
  });
  completeChatProgress("session_owned");
});
