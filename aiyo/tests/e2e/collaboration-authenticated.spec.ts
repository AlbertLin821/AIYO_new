import { expect, test } from "@playwright/test";
import { E2E_COLLABORATOR, E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";
import { buildTripPayload, resetE2EData, seedTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("authenticated collaboration roles enforce view, edit, and permission management", async ({ browser, page }) => {
  const { owner, collaborator } = await seedAuthUsers();
  const trip = await seedTripForUser(owner.id, "E2E Collaboration 台南行程");

  await loginAs(page, E2E_OWNER);
  await page.getByRole("button", { name: "分享" }).click();
  await expect(page.getByText("分享 / 協作")).toBeVisible();
  await expect(page.getByText(E2E_OWNER.email)).toBeVisible();

  const inviteResponse = await page.request.post(`/api/trips/${trip.id}/collaborators`, {
    data: { email: E2E_COLLABORATOR.email, role: "viewer" },
  });
  expect(inviteResponse.status()).toBe(201);

  const collaboratorContext = await browser.newContext();
  const collaboratorPage = await collaboratorContext.newPage();
  try {
    await loginAs(collaboratorPage, E2E_COLLABORATOR);

    const viewerListResponse = await collaboratorPage.request.get(`/api/trips/${trip.id}/collaborators`);
    expect(viewerListResponse.status()).toBe(200);

    const viewerEditResponse = await collaboratorPage.request.put(`/api/trips/${trip.id}`, {
      data: buildTripPayload(trip.id, "Viewer should not edit"),
    });
    expect(viewerEditResponse.status()).toBe(403);

    const promoteResponse = await page.request.patch(
      `/api/trips/${trip.id}/collaborators/${collaborator.id}`,
      { data: { role: "editor" } },
    );
    expect(promoteResponse.status()).toBe(200);

    const editorEditResponse = await collaboratorPage.request.put(`/api/trips/${trip.id}`, {
      data: buildTripPayload(trip.id, "Editor updated E2E trip"),
    });
    expect(editorEditResponse.status()).toBe(200);

    const collaboratorInviteResponse = await collaboratorPage.request.post(
      `/api/trips/${trip.id}/collaborators`,
      { data: { email: "nobody@example.com", role: "viewer" } },
    );
    expect(collaboratorInviteResponse.status()).toBe(403);

    const removeResponse = await page.request.delete(
      `/api/trips/${trip.id}/collaborators/${collaborator.id}`,
    );
    expect(removeResponse.status()).toBe(200);

    const removedAccessResponse = await collaboratorPage.request.get(`/api/trips/${trip.id}/collaborators`);
    expect(removedAccessResponse.status()).toBe(403);
  } finally {
    await collaboratorContext.close();
  }
});

