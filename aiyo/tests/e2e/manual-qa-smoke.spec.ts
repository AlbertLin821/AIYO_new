import { expect, test } from "@playwright/test";
import { prisma } from "../../src/lib/prisma";
import { dismissOnboardingIfVisible, loginAs, E2E_OWNER, seedAuthUsers, type E2EUser } from "./helpers/auth";
import { resetE2EData, seedChiayiScenarioForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("question_card flow: answers persist after reload", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  const trip = await seedChiayiScenarioForUser(owner.id);
  const questionCard = {
    response_type: "question_card" as const,
    title: "請選擇你的旅遊偏好",
    action: { label: "確認" },
    questions: [
      {
        slot: "pace",
        question: "你希望旅行節奏是？",
        type: "single_choice" as const,
        options: [
          { label: "放鬆", value: "relaxed", recommended: true },
          { label: "精實", value: "intensive" },
        ],
      },
    ],
  };

  const pageErrors: string[] = [];
  let aiChatMockHits = 0;
  const apiRequests: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      pageErrors.push(msg.text());
    }
  });
  page.on("request", (req) => {
    if (req.url().includes("/api/")) {
      apiRequests.push(`${req.method()} ${req.url()}`);
    }
  });
  await page.route("**/api/ai/chat**", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    aiChatMockHits += 1;
    let post: { message?: string; displayMessage?: string; questionAnswers?: unknown[] } | null = null;
    try {
      post = route.request().postDataJSON();
    } catch {
      post = null;
    }

    // Submitting the questionnaire (no message, but questionAnswers exists).
    if (post?.questionAnswers?.length) {
      const content = post.displayMessage?.trim() || "已收到你的需求：放鬆";
      await prisma.chatMessage.create({
        data: {
          userId: owner.id,
          role: "user",
          content,
          tripId: trip.id,
        },
      });
      await prisma.chatMessage.create({
        data: {
          userId: owner.id,
          role: "assistant",
          content: "收到！我會開始為你規劃。",
          tripId: trip.id,
          metadata: { responseType: "text_message" },
        },
      });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            reply: {
              id: "assistant_followup_e2e",
              role: "assistant",
              responseType: "text_message",
              content: "收到！我會開始為你規劃。",
              timestamp: "00:01",
            },
          },
        }),
      });
    }

    // First user message: return a mocked question card.
    await prisma.chatMessage.create({
      data: {
        userId: owner.id,
        role: "user",
        content: post?.message?.trim() || post?.displayMessage?.trim() || "我想開始規劃，請先問我旅遊偏好。",
        tripId: trip.id,
      },
    });
    await prisma.chatMessage.create({
      data: {
        userId: owner.id,
        role: "assistant",
        content: "請補齊條件。",
        tripId: trip.id,
        metadata: {
          responseType: "question_card",
          questionCard,
        },
      },
    });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          success: true,
          data: {
            reply: {
              id: "assistant_question_card_e2e",
              role: "assistant",
              responseType: "question_card",
              content: "請補齊條件。",
              timestamp: "00:00",
              questionCard,
            },
          },
        }),
      });
  });

  await loginAs(page, E2E_OWNER as E2EUser, "/chat");
  await dismissOnboardingIfVisible(page);

  await expect(page.getByTestId("chat-input")).toBeVisible({ timeout: 40_000 });
  const chatInput = page.getByTestId("chat-input");
  await chatInput.click();
  await chatInput.fill("我想開始規劃，請先問我旅遊偏好。");
  await expect(page.getByTestId("chat-send-button")).toBeEnabled({ timeout: 20_000 });
  await page.getByTestId("chat-send-button").click();

  // Question card: should show option buttons.
  try {
    await expect(page.getByRole("button", { name: "放鬆" }).first()).toBeVisible({ timeout: 20_000 });
  } catch {
    throw new Error(
      [
        "Question card option button '放鬆' was not visible.",
        `aiChatMockHits=${aiChatMockHits}`,
        `Captured API requests:\n${apiRequests.join("\n")}`,
        `Captured pageErrors:\n${pageErrors.join("\n")}`,
      ].join("\n"),
    );
  }
  await page.getByRole("button", { name: "放鬆" }).first().click();

  const confirmButton =
    (await page.getByRole("button", { name: "確認" }).first().isVisible().catch(() => false))
      ? page.getByRole("button", { name: "確認" }).first()
      : page.getByRole("button", { name: "繼續" }).first();
  await confirmButton.click();

  // User display message (metadata) should appear.
  await expect(page.getByText(/已收到你的需求：/)).toBeVisible({ timeout: 40_000 });

  // Reload: should persist.
  await page.reload({ waitUntil: "domcontentloaded" });
  if (/\/login/.test(page.url())) {
    await loginAs(page, E2E_OWNER as E2EUser, "/chat");
    await dismissOnboardingIfVisible(page);
  }
  await expect(page.getByText(/已收到你的需求：/)).toBeVisible({ timeout: 40_000 });
});

test("SSE steps: status rail updates and Sky Dash prompt appears", async ({ page }) => {
  await seedAuthUsers();
  await loginAs(page, E2E_OWNER as E2EUser, "/chat");
  await dismissOnboardingIfVisible(page);

  const stepResearchRunning = {
    type: "status_step",
    phase: "research",
    label: "搜尋景點與交通",
    status: "running",
    provider: "mock_web",
  };

  await page.route("**/api/chat/stream/**", async (route) => {
    if (route.request().method() !== "GET") {
      return route.fallback();
    }
    const body = [
      `event: status_step`,
      `data: ${JSON.stringify(stepResearchRunning)}`,
      ``,
    ].join("\n");

    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body,
    });
  });

  await page.route("**/api/ai/chat**", async (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    // Keep the request "in-flight" long enough for the prompt delay.
    await new Promise((r) => setTimeout(r, 60_000));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        success: true,
        data: {
          reply: {
            id: "assistant_sse_followup_e2e",
            role: "assistant",
            responseType: "text_message",
            content: "我已收到並開始規劃。",
            timestamp: "00:10",
            statusSteps: [stepResearchRunning],
          },
        },
      }),
    });
  });

  await page.getByTestId("chat-input").fill("規劃行程並展示進度列（SSE）。");
  await page.getByTestId("chat-send-button").click();

  // Typing / workflow UI should be visible while planning is in-flight.
  await expect(page.getByTestId("chat-typing-indicator")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("AI 正在為你規劃行程").first()).toBeVisible({ timeout: 20_000 });

  // Sky Dash prompt (appears after ~5s delay while planning is active).
  await expect(page.getByText("開始玩 Sky Dash")).toBeVisible({ timeout: 70_000 });
  await page.getByRole("button", { name: "開始玩 Sky Dash" }).click();

  // Game dialog should appear.
  await expect(page.getByRole("dialog", { name: "Sky Dash 小遊戲" })).toBeVisible({ timeout: 20_000 });
});

