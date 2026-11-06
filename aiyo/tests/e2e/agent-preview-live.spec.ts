import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedSeoulPhase75ScenarioForUser } from "./helpers/db";

let tripId: string;
let selectedItemId: string;

test.describe("live agent preview", () => {
  test.beforeAll(async () => {
    if (process.env.E2E_LIVE_AGENT !== "1") return;
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    const seed = await seedSeoulPhase75ScenarioForUser(owner.id);
    tripId = seed.tripId;
    selectedItemId = seed.itemIds.day1Hongdae;
    const coordinates: Array<[string, number, number]> = [
      [seed.itemIds.day1Hongdae, 37.5563, 126.9236],
      [seed.itemIds.day1Myeongdong, 37.5637, 126.985],
      [seed.itemIds.day2Gyeongbok, 37.5796, 126.977],
      [seed.itemIds.day2Bukchon, 37.5826, 126.983],
    ];
    for (const [id, latitude, longitude] of coordinates) {
      const item = await prisma.tripItem.update({ where: { id }, data: {
        latitude, longitude, placeProvider: "user", verified: true,
        photoUrl: "https://example.com/test-place.jpg",
        transportMode: "walk", transportDurationMinutes: 20, transportDistanceMeters: 1000, transportDataSource: "osrm",
      } });
      await prisma.mapPin.create({ data: {
        tripId, label: item.title, lat: latitude, lng: longitude, description: item.title,
        placeProvider: "user", photoUrl: "https://example.com/test-place.jpg",
        source: "itinerary", dayNumber: item.day, linkedTripItemId: item.id, verified: true,
      } });
    }
  });
  test.afterAll(async () => { if (process.env.E2E_LIVE_AGENT === "1") await resetE2EData(); });

  test("turns a trip instruction into a persisted, non-writing preview", async ({ page }, info) => {
    test.skip(process.env.E2E_LIVE_AGENT !== "1", "Requires a running local AI model");
    const hydrationSave = page.waitForResponse((response) => response.url().includes("/api/trips/current") && response.request().method() === "PUT", { timeout: 12_000 }).catch(() => null);
    await loginAs(page, E2E_OWNER, "/chat");
    await hydrationSave;
    const before = await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true } });
    const response = await page.request.post(`/api/trips/${tripId}/agent/preview`, {
      data: { instruction: "把第一天的弘大移到第二天景福宮後面，保留其他地點", baseRevision: before.revision, selectedEntityIds: [selectedItemId] },
      timeout: 60_000,
    });
    expect(response.status(), await response.text()).toBe(200);
    const payload = await response.json();
    expect(payload.data.previewId).toBeTruthy();
    expect(payload.data.operations.length).toBeGreaterThan(0);
    expect(await prisma.agentPreview.count({ where: { id: payload.data.previewId, tripId } })).toBe(1);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true } })).revision).toBe(before.revision);

    await page.getByTestId("chat-input").fill("把第一天的弘大移到第二天景福宮後面，保留其他地點");
    const uiPreviewResponse = page.waitForResponse((response) => response.url().endsWith(`/api/trips/${tripId}/agent/preview`) && response.request().method() === "POST");
    await page.getByTestId("chat-input").press("Enter");
    expect((await uiPreviewResponse).status()).toBe(200);
    const card = page.getByTestId("agent-change-preview");
    await expect(card).toBeVisible({ timeout: 45_000 });
    await expect(card).toContainText("尚未套用");
    await expect(card).toContainText("第 1 天");
    await expect(card).toContainText("第 2 天");
    await page.screenshot({ path: info.outputPath("agent-preview-desktop.png"), fullPage: true });
    const pending = await prisma.agentPreview.findFirstOrThrow({ where: { tripId, status: "pending" }, orderBy: { createdAt: "desc" } });
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: tripId }, select: { revision: true } })).revision).toBe(pending.baseRevision);
    await page.reload();
    await expect(card).toBeVisible({ timeout: 30_000 });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator("main").first()).toHaveCSS("margin-left", "0px", { timeout: 10_000 });
    await expect(card.getByRole("button", { name: "確認套用" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: info.outputPath("agent-preview-mobile.png"), fullPage: true });
    await card.getByRole("button", { name: "確認套用" }).focus();
    await expect(card.getByRole("button", { name: "確認套用" })).toBeFocused();
    await card.getByRole("button", { name: "確認套用" }).click();
    await expect(card).toHaveCount(0, { timeout: 30_000 });
    expect((await prisma.tripItem.findUniqueOrThrow({ where: { id: selectedItemId } })).day).toBe(2);
    await expect(page.getByTestId("chat-agent-history-action")).toHaveText("復原 AI 修改", { timeout: 20_000 });
    await page.getByTestId("chat-agent-history-action").click();
    await expect(page.getByTestId("chat-agent-history-action")).toHaveText("重做 AI 修改", { timeout: 20_000 });
    const latestHistory = await (await page.request.get(`/api/trips/${tripId}/mutations/agent-latest`)).json();
    expect(latestHistory.data.action?.mode).toBe("redo");
    expect((await prisma.tripItem.findUniqueOrThrow({ where: { id: selectedItemId } })).day).toBe(1);
    const redoResponse = page.waitForResponse((response) => response.url().endsWith("/mutations/execute") && response.request().postDataJSON()?.action === "redo" && response.request().method() === "POST");
    await expect(page.getByTestId("chat-agent-history-action")).toBeVisible({ timeout: 10_000 });
    await page.getByTestId("chat-agent-history-action").click();
    expect((await redoResponse).status()).toBe(200);
    await expect.poll(async () => (await prisma.tripItem.findUniqueOrThrow({ where: { id: selectedItemId } })).day).toBe(2);
  });
});
