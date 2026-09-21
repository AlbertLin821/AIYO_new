import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs, waitForAuthenticatedSession } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers } from "./helpers/db";

test.describe("MapLibre open-map flow", () => {
  test.beforeAll(async () => {
    await resetE2EData();
    await seedAuthUsers();
  });

  test.afterAll(async () => {
    await resetE2EData();
  });

  test("loads the map, searches, selects a POI, and finds nearby restaurants", async ({ page }) => {
    const mapProviderErrors: string[] = [];
    page.on("console", (message) => {
      if (/BillingNotEnabledMapError|Google Maps JavaScript API error|google is not defined/i.test(message.text())) {
        mapProviderErrors.push(message.text());
      }
    });
    await page.route("**/api/maps/search?**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            results: [
              {
                id: "photon:N:101",
                name: "台北 101",
                location: { lat: 25.0339, lng: 121.5645 },
                address: "台北市信義區信義路五段 7 號",
                source: "photon",
              },
            ],
          },
        }),
      });
    });
    await page.route("**/api/maps/nearby?**", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          data: {
            results: [
              {
                id: "overpass:N:202",
                name: "測試餐廳",
                location: { lat: 25.0342, lng: 121.565 },
                address: "台北市信義區",
                source: "overpass",
              },
            ],
          },
        }),
      });
    });

    const workerStarted = page.waitForEvent("worker", {
      predicate: (worker) => worker.url().includes("/maplibre/maplibre-gl-worker.mjs"),
      timeout: 40_000,
    });
    await loginAs(page, E2E_OWNER, "/map");
    await dismissOnboardingIfVisible(page);
    await waitForAuthenticatedSession(page, E2E_OWNER.email);

    const map = page.getByTestId("map-view");
    await expect(map).toBeVisible({ timeout: 40_000 });
    await expect(page.getByTestId("maplibre-map")).toHaveCSS("position", "absolute");
    await expect.poll(async () => (await page.getByTestId("maplibre-map").boundingBox())?.height ?? 0).toBeGreaterThan(300);
    await expect(map.locator("canvas").first()).toBeVisible({ timeout: 40_000 });
    await expect(map.getByRole("button", { name: "Zoom in" })).toBeVisible();
    await workerStarted;
    for (const filename of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
      const response = await page.request.get(`/maplibre/${filename}`);
      expect(response.ok()).toBe(true);
      expect(response.headers()["content-type"]).toMatch(/javascript/);
    }

    await map.getByRole("textbox", { name: "搜尋景點或地址" }).fill("台北101");
    await expect(map.getByRole("button", { name: /台北 101/ })).toBeVisible();
    await map.getByRole("button", { name: /台北 101/ }).click();
    await expect(map.getByRole("button", { name: /地點：台北 101/ })).toBeVisible();
    await expect(map).toContainText("台北 101");

    await map.getByRole("button", { name: "附近餐廳" }).click();
    await expect(map.getByRole("button", { name: /地點：測試餐廳/ })).toBeVisible();
    expect(mapProviderErrors).toEqual([]);
  });
});
