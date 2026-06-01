import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedTripForUser } from "./helpers/db";
import { prisma } from "../../src/lib/prisma";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("地圖 marker info card", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    const trip = await seedTripForUser(owner.id, "E2E Rich Map Pin");
    await prisma.mapPin.updateMany({
      where: {
        tripId: trip.id,
        label: "赤崁樓",
      },
      data: {
        description: "具名景點，適合排入市區步行路線。",
        address: "台南市中西區民族路二段212號",
        openingHours: "08:30-21:30",
        phoneNumber: "06-220-5647",
        googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=赤崁樓",
        photoUrl: "https://placehold.co/640x360?text=Chihkan",
        placeId: "e2e-chihkan-place-id",
        source: "video",
        confidence: 0.92,
        verified: true,
        dayNumber: 1,
      },
    });
    await prisma.mapPin.create({
      data: {
        tripId: trip.id,
        label: "安平古堡",
        lat: 23.0015,
        lng: 120.1612,
        description: "E2E 第二個地圖 pin",
        address: "台南市安平區國勝路82號",
        dayNumber: 1,
      },
    });
  });

  test("點選 marker 顯示 InfoWindow 資訊卡", async ({ page }) => {
    await loginAs(page, E2E_OWNER, "/map");
    const initialBootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.goto("/map");
    await initialBootstrap.catch(() => {});
    await dismissOnboardingIfVisible(page);

    const mockMarkers = page.getByTestId("map-pin-marker");
    const markerCount = await mockMarkers.count();
    const clicks = Math.min(markerCount > 0 ? markerCount : 1, 2);

    for (let i = 0; i < clicks; i += 1) {
      if (markerCount > 0) {
        await mockMarkers.nth(i).click();
      } else {
        const marker = page.locator('[role="button"][tabindex="0"]').filter({ hasText: "赤崁樓" });
        await expect(marker).toBeVisible({ timeout: 40_000 });
        await marker.click();
      }

      const infoPanel = page.getByTestId("map-pin-info-panel");
      await expect(infoPanel).toBeVisible({ timeout: 15_000 });
      await expect(infoPanel).toContainText("地址");
      await expect(infoPanel).toContainText("規劃路線");
    }

    await expect(page.getByTestId("selected-map-pin")).toHaveCount(0);
  });

  test("再點同一 marker 可關閉資訊卡", async ({ page }) => {
    await loginAs(page, E2E_OWNER, "/map");
    const initialBootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.goto("/map");
    await initialBootstrap.catch(() => {});
    await dismissOnboardingIfVisible(page);

    const mockMarkers = page.getByTestId("map-pin-marker");
    await expect(mockMarkers.first()).toBeVisible({ timeout: 40_000 });
    await mockMarkers.first().click();

    const infoPanel = page.getByTestId("map-pin-info-panel");
    await expect(infoPanel).toBeVisible({ timeout: 15_000 });

    await mockMarkers.first().click();
    await expect(infoPanel).toBeHidden({ timeout: 15_000 });
  });
});
