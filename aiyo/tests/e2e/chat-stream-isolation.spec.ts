import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import { E2E_COLLABORATOR, E2E_OWNER, resetE2EData, seedAuthUsers } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetE2EData();
  await seedAuthUsers();
});

test.afterAll(async () => {
  await resetE2EData();
});

test("stopping during delayed progress registration prevents the old POST and allows another message", async ({ page }) => {
  test.setTimeout(120_000);
  await loginAs(page, E2E_OWNER, "/chat");
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  await dismissOnboardingIfVisible(page);

  let registrations = 0;
  let finishFirstRegistration!: () => void;
  const firstRegistrationFinished = new Promise<void>((resolve) => { finishFirstRegistration = resolve; });
  const sentMessages: string[] = [];
  const cancelledMessage = "你好，這則訊息會取消";
  const nextMessage = "你好，這是下一則訊息";
  const oldReply = "舊請求不應出現的回覆";
  const nextReply = "新的對話仍然可以正常回覆。";

  await page.route("**/api/chat/stream/register", async (route) => {
    registrations += 1;
    const first = registrations === 1;
    if (first) await new Promise((resolve) => setTimeout(resolve, 3000));
    try {
      await route.fulfill({ status: 200, json: { success: true, data: { sessionId: "test-progress" } } });
    } catch (error) {
      // The first fetch is expected to be aborted by the stop button.
      if (!first) throw error;
    } finally {
      if (first) finishFirstRegistration();
    }
  });
  await page.route("**/api/chat/stream/chat_*", (route) => route.fulfill({
    status: 200, contentType: "text/event-stream", body: "event: done\ndata: {}\n\n",
  }));
  await page.route("**/api/ai/chat", async (route) => {
    const body = route.request().postDataJSON() as { message: string };
    sentMessages.push(body.message);
    await route.fulfill({ status: 200, json: { success: true, data: {
      reply: { id: `reply_${sentMessages.length}`, role: "assistant", responseType: "text_message",
        content: body.message === cancelledMessage ? oldReply : nextReply, timestamp: "12:00" },
    } } });
  });

  await page.getByTestId("chat-input").fill(cancelledMessage);
  await page.getByTestId("chat-send-button").click();
  await expect.poll(() => registrations).toBe(1);
  await page.getByTestId("chat-stop-button").click();
  await expect(page.getByTestId("chat-send-button")).toBeVisible();

  // A new request starts while the cancelled registration is still outstanding.
  await page.getByTestId("chat-input").fill(nextMessage);
  await page.getByTestId("chat-send-button").click();
  await expect(page.getByTestId("chat-message-ai").last()).toContainText(nextReply);
  await firstRegistrationFinished;
  // Allow any continuation of the original registration to reach the POST route.
  await page.waitForTimeout(500);
  expect(sentMessages).toEqual([nextMessage]);
  await expect(page.getByText(oldReply, { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("chat-message-ai-thinking")).toHaveCount(0);
  await expect(page.getByTestId("chat-send-button")).toBeVisible();
});

test("another user's progress session is rejected before assistant progress or generation", async ({ page, browser }) => {
  test.setTimeout(120_000);
  await loginAs(page, E2E_OWNER, "/chat");
  await waitForAuthenticatedSession(page, E2E_OWNER.email);
  const sessionId = `isolation_${randomUUID()}`;
  const registered = await page.request.post("/api/chat/stream/register", { data: { sessionId } });
  expect(registered.status()).toBe(200);

  // Observe the real owner stream: a rejected request must not start research,
  // model generation, emit text, or prematurely complete this stream.
  await page.evaluate((id) => {
    const state = window as typeof window & { isolationStream?: EventSource; isolationEvents?: string[]; isolationOpen?: boolean };
    state.isolationEvents = [];
    state.isolationOpen = false;
    const stream = new EventSource(`/api/chat/stream/${encodeURIComponent(id)}`);
    state.isolationStream = stream;
    stream.onopen = () => { state.isolationOpen = true; };
    for (const type of ["status_step", "text_snapshot", "done"]) {
      stream.addEventListener(type, (event) => {
        // An empty initial text snapshot is legitimate replay, not generation.
        if (type === "text_snapshot" && !JSON.parse((event as MessageEvent).data).text) return;
        state.isolationEvents!.push(type);
      });
    }
  }, sessionId);
  await expect.poll(() => page.evaluate(() => (window as typeof window & { isolationOpen?: boolean }).isolationOpen)).toBe(true);

  const otherContext = await browser.newContext();
  try {
    const otherPage = await otherContext.newPage();
    await loginAs(otherPage, E2E_COLLABORATOR, "/chat");
    await waitForAuthenticatedSession(otherPage, E2E_COLLABORATOR.email);
    const rejected = await otherPage.request.post("/api/ai/chat", {
      data: { message: "請比較東京和大阪自由行的交通優缺點", progressSessionId: sessionId },
      timeout: 15_000,
    });
    expect(rejected.status()).toBe(403);
    expect(await rejected.json()).toMatchObject({ success: false, error: { code: "forbidden" } });
    await page.waitForTimeout(500);
    const ownerState = await page.evaluate(() => {
      const state = window as typeof window & { isolationStream?: EventSource; isolationEvents?: string[] };
      return { events: state.isolationEvents, readyState: state.isolationStream?.readyState };
    });
    expect(ownerState.events).toEqual([]);
    expect(ownerState.readyState).toBe(1);
    const deniedRead = await otherPage.request.get(`/api/chat/stream/${encodeURIComponent(sessionId)}`);
    expect(deniedRead.status()).toBe(403);
  } finally {
    await page.evaluate(() => (window as typeof window & { isolationStream?: EventSource }).isolationStream?.close());
    await otherContext.close();
  }
});
