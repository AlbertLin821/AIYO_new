import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers } from "./helpers/db";
import { buildChiayiE2eVideoSummaryResult } from "./helpers/recommendationRouteAugment";

test.beforeAll(async () => { await seedAuthUsers(); });
test.afterAll(async () => { await resetE2EData(); });

test("影片工作重整後恢復，暫時斷線不重送分析", async ({ page }) => {
  await loginAs(page, E2E_OWNER, "/");
  const session = await (await page.request.get("/api/auth/session")).json();
  const ownerId = session.user.id as string;
  const storageKey = `aiyo-video-jobs-v2:${ownerId}`;
  let polls = 0;
  let submissions = 0;
  let complete = false;
  const result = buildChiayiE2eVideoSummaryResult();
  page.on("request", request => {
    if (request.url().includes("/api/videos/summarize")) submissions += 1;
  });
  await page.route("**/api/videos/jobs/recovery-fixture", async route => {
    polls += 1;
    if (polls === 1) return route.fulfill({ status: 503, body: "temporary outage" });
    await route.fulfill({ json: { success: true, data: {
      jobId: "recovery-fixture", state: complete ? "completed" : "active",
      progress: { phase: "extract", label: "整理字幕", percent: 45 },
      ...(complete ? { result } : {}),
    } } });
  });
  await page.evaluate(({ videoId, ownerId, storageKey }) => localStorage.setItem(storageKey, JSON.stringify([
    { jobId: "recovery-fixture", videoId, ownerId },
  ])), { videoId: result.video.videoId, ownerId, storageKey });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => polls).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toContain("recovery-fixture");
  complete = true;
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect.poll(() => page.evaluate(key => localStorage.getItem(key), storageKey)).toBe("[]");
  await expect(page.getByTestId("video-card").filter({ hasText: result.video.title }).first()).toBeVisible();
  expect(submissions).toBe(0);
});
