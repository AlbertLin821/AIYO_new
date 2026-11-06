import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";

test.describe("self-hosted map journey", () => {
  test.beforeAll(async () => {
    if (process.env.E2E_LOCAL_MAPS !== "1") return;
    await resetE2EData();
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test.afterAll(async () => {
    if (process.env.E2E_LOCAL_MAPS === "1") await resetE2EData();
  });

  test("searches a real place, explores nearby restaurants and routes locally", async ({ page }, info) => {
    test.skip(process.env.E2E_LOCAL_MAPS !== "1", "Requires self-hosted Photon, Overpass and OSRM");
    const mapStyleErrors: string[] = [];
    page.on("pageerror", (error) => { if (/Style is not done loading/.test(error.message)) mapStyleErrors.push(error.message); });
    await loginAs(page, E2E_OWNER, "/map");
    await dismissOnboardingIfVisible(page);
    await expect(page.getByText("載入開放地圖中…")).toBeHidden({ timeout: 30_000 });

    await page.getByRole("textbox", { name: "搜尋景點或地址" }).fill("台北101");
    await page.getByRole("button", { name: /台北101/ }).first().click();
    await expect(page.getByRole("region", { name: "地點預覽" })).toContainText("OpenStreetMap / Photon");
    await expect(page.getByRole("region", { name: "地點預覽" }).getByRole("link", { name: "查看 OpenStreetMap 來源" })).toHaveAttribute("href", /openstreetmap\.org\/(node|way|relation)\/\d+/);
    await expect(page.getByTestId("map-preview-marker")).toBeVisible();
    await page.screenshot({ path: info.outputPath("local-photon-place.png"), fullPage: true });

    const nearbyResponse = page.waitForResponse((response) => response.url().includes("/api/maps/nearby?") && response.ok());
    await page.getByRole("button", { name: "附近餐廳" }).click();
    const nearby = await nearbyResponse;
    const nearbyPayload = await nearby.json();
    expect(nearbyPayload.data.results.length).toBeGreaterThan(0);
    expect(nearbyPayload.data.results[0].source).toBe("overpass");
    await expect(page.getByRole("region", { name: "附近餐廳結果" })).toContainText(/約 \d+(?:\.\d+)? (?:公尺|公里)/);
    await expect(page.getByRole("button", { name: nearbyPayload.data.results[0].name })).toBeVisible();
    await page.screenshot({ path: info.outputPath("local-overpass-nearby.png"), fullPage: true });
    await page.getByRole("button", { name: nearbyPayload.data.results[0].name }).click();
    await expect(page.getByRole("region", { name: "地點預覽" })).toContainText("OpenStreetMap / Overpass");
    await expect(page.getByRole("region", { name: "地點預覽" }).getByRole("link", { name: "查看 OpenStreetMap 來源" })).toHaveAttribute("href", /openstreetmap\.org\/(node|way|relation)\/\d+/);
    await expect(page.getByTestId("map-preview-marker")).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "行程面板" })).toBeHidden();
    await expect(page.getByRole("region", { name: "地點預覽" })).toBeVisible();
    await expect(page.getByRole("button", { name: "開啟行程面板" })).toBeHidden();
    const markerBox = await page.getByTestId("map-preview-marker").boundingBox();
    const previewBox = await page.getByRole("region", { name: "地點預覽" }).boundingBox();
    expect(markerBox).not.toBeNull();
    expect(previewBox).not.toBeNull();
    expect(markerBox!.x).toBeGreaterThanOrEqual(0);
    expect(markerBox!.x + markerBox!.width).toBeLessThanOrEqual(390);
    expect(markerBox!.y + markerBox!.height).toBeLessThan(previewBox!.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.screenshot({ path: info.outputPath("local-overpass-mobile.png"), fullPage: true });

    const route = await page.request.post("/api/maps/route", {
      data: { points: [{ lat: 35.7148, lng: 139.7966 }, { lat: 35.7101, lng: 139.8107 }], profile: "driving" },
    });
    expect(route.ok()).toBeTruthy();
    const routePayload = await route.json();
    expect(routePayload.data.route.distanceMeters).toBeGreaterThan(1000);
    expect(routePayload.data.route.durationSeconds).toBeGreaterThan(0);

    const japanNearby = await page.request.get("/api/maps/nearby?lat=35.7148&lng=139.7967&radius=1500&category=restaurant&limit=12");
    expect(japanNearby.ok()).toBeTruthy();
    const japanNearbyPayload = await japanNearby.json();
    expect(japanNearbyPayload.data.results.length).toBeGreaterThan(0);
    expect(japanNearbyPayload.data.results[0].source).toBe("overpass");
    expect(mapStyleErrors).toEqual([]);
  });
});
