import { expect, test } from "@playwright/test";
import { E2E_OWNER, loginAs, seedAuthUsers } from "./helpers/auth";
import { findFolderByName, getTripById, getTripFolderId, resetE2EData, seedTripForUser } from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test("authenticated user can manage folders without deleting trips", async ({ page }) => {
  const { owner } = await seedAuthUsers();
  const trip = await seedTripForUser(owner.id, "E2E Folder 台南行程");
  const folderName = "E2E 台灣旅遊";
  const renamedFolderName = "E2E 台南美食";

  await loginAs(page, E2E_OWNER);

  await expect(page.getByRole("heading", { name: "E2E Folder 台南行程" })).toBeVisible();
  await page.getByRole("button", { name: "建立新資料夾" }).click();
  await page.getByPlaceholder("資料夾名稱").fill(folderName);
  await page.getByRole("button", { name: "確認建立" }).click();
  await expect(page.locator("span").filter({ hasText: folderName })).toBeVisible();

  await page.locator("span").filter({ hasText: folderName }).locator("..").getByRole("button", { name: "改名" }).click();
  const renameDialog = page.getByRole("dialog", { name: "重新命名資料夾" });
  await expect(renameDialog).toBeVisible();
  await renameDialog.getByLabel("資料夾名稱").fill(renamedFolderName);
  await renameDialog.getByRole("button", { name: "儲存" }).click();
  await expect(page.locator("span").filter({ hasText: renamedFolderName })).toBeVisible();

  const folder = await findFolderByName(owner.id, renamedFolderName);
  expect(folder).not.toBeNull();

  await page.getByRole("button", { name: /Your designs|我的行程/ }).click();
  await page.getByLabel("目前行程放在").selectOption(folder!.id);
  await expect.poll(() => getTripFolderId(trip.id)).toBe(folder!.id);

  await page.getByLabel("目前行程放在").selectOption(folder!.id);
  await expect(page.getByRole("heading", { name: "E2E Folder 台南行程" })).toBeVisible();

  await page.locator("span").filter({ hasText: renamedFolderName }).locator("..").getByRole("button", { name: "刪除" }).click();
  const deleteDialog = page.getByRole("dialog", { name: "刪除資料夾" });
  await expect(deleteDialog).toContainText("行程會移出資料夾");
  await deleteDialog.getByRole("button", { name: "確認刪除" }).click();
  await expect(page.getByText(renamedFolderName)).toHaveCount(0);

  await expect.poll(() => getTripFolderId(trip.id)).toBeNull();
  await expect(await getTripById(trip.id)).not.toBeNull();
});
