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
  });

  test("選取 marker 會顯示完整資訊與路線連結", async ({ page }) => {
    await loginAs(page, E2E_OWNER, "/map");
    const initialBootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 40_000 },
    );
    await page.goto("/map");
    await initialBootstrap.catch(() => {});
    await dismissOnboardingIfVisible(page);

    const marker = page.locator('[role="button"][tabindex="0"]').filter({ hasText: "赤崁樓" });
    await expect(marker).toBeVisible({ timeout: 40_000 });
    await marker.click();

    const card = page.getByTestId("selected-map-pin");
    await expect(card).toBeVisible();
    await expect(card).toContainText("赤崁樓");
    await expect(card).toContainText("台南市中西區民族路二段212號");
    await expect(card).toContainText("08:30-21:30");
    await expect(card).toContainText("06-220-5647");
    await expect(page.getByTestId("map-route-link")).toHaveAttribute("href", /google\.com\/maps\/dir/);
    await expect(page.getByTestId("map-google-maps-link")).toHaveAttribute("href", /google\.com\/maps/);
  });
});
