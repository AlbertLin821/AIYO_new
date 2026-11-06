import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";

test.describe("core journey visual baseline", () => {
  test.beforeAll(async () => {
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });
  test.afterAll(async () => { await resetE2EData(); });

  test("desktop chat, itinerary and map share the selected trip", async ({ page }, info) => {
    await loginAs(page, E2E_OWNER, "/chat");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("chat-active-trip")).toBeVisible();
    await expect(page.getByTestId("chat-active-trip")).toContainText("嘉義", { timeout: 20_000 });
    await page.screenshot({ path: info.outputPath("01-chat-desktop.png"), fullPage: true });
    await page.goto("/itinerary");
    await expect(page.locator("body")).toContainText("嘉義");
    await expect(page.locator("body")).not.toContainText("載入行程中", { timeout: 20_000 });
    await page.screenshot({ path: info.outputPath("02-itinerary-desktop.png"), fullPage: true });
    const destinationLookup = page.waitForResponse((response) => response.url().includes("/api/maps/search?") && new URL(response.url()).searchParams.get("q") === "嘉義市");
    await page.goto("/map");
    await expect(page.getByTestId("map-view")).toBeVisible();
    await expect(page.getByText("載入開放地圖中…")).toBeHidden({ timeout: 30_000 });
    await destinationLookup;
    await page.waitForTimeout(600);
    await page.screenshot({ path: info.outputPath("03-map-desktop.png"), fullPage: true });
  });

  test("mobile chat and map keep primary controls reachable", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, E2E_OWNER, "/chat");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("chat-active-trip")).toBeVisible();
    await expect(page.getByTestId("chat-active-trip")).toContainText("嘉義", { timeout: 20_000 });
    await expect(page.getByTestId("chat-input")).toBeVisible();
    await page.screenshot({ path: info.outputPath("04-chat-mobile.png"), fullPage: true });
    const destinationLookup = page.waitForResponse((response) => response.url().includes("/api/maps/search?") && new URL(response.url()).searchParams.get("q") === "嘉義市");
    await page.goto("/map");
    await expect(page.getByTestId("map-view")).toBeVisible();
    await expect(page.getByRole("button", { name: "開啟行程面板" })).toBeVisible();
    await expect(page.getByText("載入開放地圖中…")).toBeHidden({ timeout: 30_000 });
    await destinationLookup;
    await page.waitForTimeout(600);
    await page.getByRole("textbox", { name: "搜尋景點或地址" }).click();
    await expect(page.getByText("Ollama 服務未啟動")).toHaveCount(0);
    await page.screenshot({ path: info.outputPath("05-map-mobile.png"), fullPage: true });
  });

  test("switching conversations blocks send until the matching trip loads", async ({ page }, info) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginAs(page, E2E_OWNER, "/chat");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByTestId("chat-active-trip")).toContainText("嘉義", { timeout: 20_000 });
    const initialTripId = await page.evaluate(async () => (await fetch("/api/bootstrap").then((response) => response.json())).data.trip.tripId as string);
    await page.getByRole("button", { name: "新增對話" }).last().click();
    await expect(page.getByTestId("chat-active-trip")).toContainText("未命名行程", { timeout: 20_000 });

    let releaseSwitch: (() => void) | undefined;
    await page.route("**/api/trips/active", async (route) => {
      if (route.request().postDataJSON()?.tripId === initialTripId) {
        await new Promise<void>((resolve) => { releaseSwitch = resolve; });
      }
      await route.continue();
    });
    try {
      await page.getByRole("button", { name: /嘉義兩天一夜/ }).last().click();
      await expect(page.getByTestId("chat-active-trip")).toContainText("正在載入行程");
      await expect(page.getByTestId("chat-input")).toBeDisabled();
      await page.screenshot({ path: info.outputPath("05b-conversation-switch-loading.png"), fullPage: true });
    } finally {
      releaseSwitch?.();
    }
    await expect(page.getByTestId("chat-active-trip")).toContainText("嘉義", { timeout: 20_000 });
    await expect(page.getByTestId("chat-input")).toBeEnabled();
  });

  test("search shows a sourced place preview before adding to the itinerary", async ({ page }, info) => {
    let selectedPlaceDetailsCalls = 0;
    await page.route("**/api/map/place-details", async (route) => {
      if (route.request().postData()?.includes("photon:node:123")) selectedPlaceDetailsCalls += 1;
      await route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: { message: "Legacy details unavailable" } }) });
    });
    await page.route("**/api/maps/search?*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { results: [{ id: "photon:node:123", name: "嘉義公園", location: { lat: 23.483, lng: 120.458 }, address: "嘉義市", source: "photon", category: "park", checkedAt: "2026-11-05T00:00:00.000Z" }] } }) });
    });
    await page.route("**/api/maps/nearby?*", async (route) => {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data: { results: [{ id: "overpass:node:456", name: "嘉義餐廳", location: { lat: 23.484, lng: 120.459 }, address: "嘉義市", source: "overpass", category: "restaurant", checkedAt: "2026-11-05T00:00:00.000Z" }] } }) });
    });
    await loginAs(page, E2E_OWNER, "/map");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByText("載入開放地圖中…")).toBeHidden({ timeout: 30_000 });
    const before = await page.evaluate(async () => (await fetch("/api/bootstrap").then((res) => res.json())).data.trip.pins.length as number);
    const searchInput = page.getByRole("textbox", { name: "搜尋景點或地址" });
    await searchInput.fill("嘉義公園");
    await expect(page.getByRole("button", { name: /嘉義公園/ })).toBeVisible();
    await searchInput.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: /嘉義公園/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("region", { name: "地點預覽" })).toContainText("OpenStreetMap / Photon");
    await expect(page.getByRole("button", { name: "關閉地點預覽" })).toBeFocused();
    await page.screenshot({ path: info.outputPath("06-place-preview.png"), fullPage: true });
    const nearbyRequest = page.waitForRequest((request) => request.url().includes("/api/maps/nearby?"));
    await page.getByRole("button", { name: "附近餐廳" }).click();
    const nearbyUrl = new URL((await nearbyRequest).url());
    expect(nearbyUrl.searchParams.get("lat")).toBe("23.483");
    expect(nearbyUrl.searchParams.get("lng")).toBe("120.458");
    await expect(page.getByRole("button", { name: /嘉義餐廳/ })).toBeVisible();
    await page.screenshot({ path: info.outputPath("06b-nearby-restaurants.png"), fullPage: true });
    await page.getByRole("button", { name: "關閉地點預覽" }).click();
    await expect(searchInput).toBeFocused();
    await searchInput.fill("嘉義公園");
    await page.getByRole("button", { name: /嘉義公園/ }).click();
    const afterPreview = await page.evaluate(async () => (await fetch("/api/bootstrap").then((res) => res.json())).data.trip.pins.length as number);
    expect(afterPreview).toBe(before);
    await page.getByRole("region", { name: "地點預覽" }).getByRole("button", { name: "加入行程" }).click();
    await expect(page.getByRole("region", { name: "地點預覽" })).toHaveCount(0);
    await expect(page.getByRole("region", { name: "加入行程" })).toBeFocused();
    await expect(page.getByText("嘉義公園", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "加入行程" }).click();
    await expect.poll(async () => page.evaluate(async () => (await fetch("/api/bootstrap").then((res) => res.json())).data.trip.pins.length as number)).toBeGreaterThan(before);
    const saved = await page.evaluate(async () => (await fetch("/api/bootstrap").then((res) => res.json())).data.trip);
    const savedPlace = saved.itinerary.flatMap((day: { items: Array<{ title: string; location?: { resolvedFrom?: string; checkedAt?: string; category?: string } }> }) => day.items).find((item: { title: string }) => item.title === "嘉義公園");
    expect(savedPlace?.location?.resolvedFrom).toBe("photon");
    expect(savedPlace?.location?.checkedAt).toBeTruthy();
    expect(savedPlace?.location?.category).toBe("park");
    expect(selectedPlaceDetailsCalls).toBe(0);
    await page.screenshot({ path: info.outputPath("07-place-added.png"), fullPage: true });
  });
});
