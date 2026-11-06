import { expect, test } from "@playwright/test";
import { prisma } from "@/lib/prisma";
import { loginAs } from "./helpers/auth";
import { E2E_OWNER, resetE2EData, seedAuthUsers, seedTripForUser } from "./helpers/db";

test("departure date survives save, reload, and trip serialization", async ({ page }) => {
  await resetE2EData();
  try {
    const { owner } = await seedAuthUsers();
    const trip = await seedTripForUser(owner.id);
    await loginAs(page, E2E_OWNER, "/itinerary");
    expect((await page.request.post("/api/trips/active", { data: { tripId: trip.id } })).status()).toBe(200);
    await page.goto("/itinerary");
    const input = page.getByTestId("itinerary-start-date");
    await expect(input).toBeVisible();
    await input.fill("2026-11-06");
    await input.blur();
    await expect.poll(async () => (await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).startDate?.toISOString().slice(0, 10)).toBe("2026-11-06");
    await page.reload();
    await expect(page.getByTestId("itinerary-start-date")).toHaveValue("2026-11-06");
    const revision = (await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).revision;
    const invalid = await page.request.patch(`/api/trips/${trip.id}`, { data: { startDate: "2027-02-29", revision } });
    expect(invalid.status()).toBe(400);
    await input.fill("");
    await input.blur();
    await expect.poll(async () => (await prisma.trip.findUniqueOrThrow({ where: { id: trip.id } })).startDate).toBeNull();
    await page.reload();
    await expect(page.getByTestId("itinerary-start-date")).toHaveValue("");
  } finally {
    await resetE2EData();
  }
});
