import assert from "node:assert/strict";
import test from "node:test";
import { ensureChatProgressSession, canAccessChatProgressSession, publishChatText, getChatText, subscribeChatText } from "./chatProgressStore";
test("text snapshots replay once and ownership cannot be reassigned", () => {
  const id = `test-${Date.now()}`;
  ensureChatProgressSession(id, "owner");
  const seen: string[] = [];
  const stop = subscribeChatText(id, (text) => seen.push(text));
  publishChatText(id, "你好"); publishChatText(id, "你好，東京");
  assert.equal(getChatText(id), "你好，東京");
  assert.deepEqual(seen, ["你好", "你好，東京"]);
  assert.throws(() => ensureChatProgressSession(id, "intruder"));
  assert.equal(canAccessChatProgressSession(id, "intruder"), false);
  stop(); publishChatText(id, "final"); assert.equal(seen.length, 2);
});
