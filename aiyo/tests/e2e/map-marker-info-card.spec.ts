import { expect, test } from "@playwright/test";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedChiayiScenarioForUser } from "./helpers/db";
import { prisma } from "../../src/lib/prisma";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("地圖 marker info card", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    const trip = await seedChiayiScenarioForUser(owner.id);
    await prisma.mapPin.create({
      data: {
        id: "e2e-rich-pin",
        tripId: trip.id,
        label: "林聰明砂鍋魚頭",
        lat: 23.47018,
        lng: 120.44595,
        description: "具名餐廳，適合正餐安排。",
        address: "嘉義市東區中正路361號",
        openingHours: "10:00-21:00",
        phoneNumber: "05-227-0661",
        googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=林聰明砂鍋魚頭",
        photoUrl: "https://placehold.co/640x360?text=Lin",
        placeId: "e2e-lin-place-id",
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

    const marker = page.getByRole("button", { name: "林聰明砂鍋魚頭" });
    await expect(marker).toBeVisible({ timeout: 40_000 });
    await marker.click();

    const card = page.getByTestId("selected-map-pin");
    await expect(card).toBeVisible();
    await expect(card).toContainText("林聰明砂鍋魚頭");
    await expect(card).toContainText("嘉義市東區中正路361號");
    await expect(card).toContainText("10:00-21:00");
    await expect(card).toContainText("05-227-0661");
    await expect(page.getByTestId("map-route-link")).toHaveAttribute("href", /google\.com\/maps\/dir/);
    await expect(page.getByTestId("map-google-maps-link")).toHaveAttribute("href", /google\.com\/maps/);
  });
});
