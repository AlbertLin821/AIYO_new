import { expect, test } from "@playwright/test";
import path from "path";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import { ensureArtifactDirs, writeArtifactJson } from "./helpers/artifacts";
import { openItineraryEditor } from "./helpers/itinerary";
import { fetchTripItineraryFromBootstrap } from "./helpers/chat";
import {
  resetE2EData,
  seedAuthUsers,
  seedChiayiScenarioForUser,
  E2E_OWNER,
} from "./helpers/db";

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("嘉義情境行程編輯器", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test("新增、編輯、刪除、拖曳排序", async ({ page }) => {
    test.setTimeout(300_000);
    ensureArtifactDirs();
    const diagnosticEvents: unknown[] = [];
    const recordDiagnostic = (event: unknown) => {
      diagnosticEvents.push({ at: new Date().toISOString(), event });
      writeArtifactJson("editor-save-diagnostics.json", diagnosticEvents);
    };
    page.on("request", (request) => {
      if (request.method() === "PUT" && new URL(request.url()).pathname === "/api/trips/current") {
        recordDiagnostic({ type: "save-request", body: request.postDataJSON() });
      }
    });
    page.on("response", async (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname === "/api/trips/current" || pathname === "/api/bootstrap") {
        try {
          recordDiagnostic({ type: "response", pathname, method: response.request().method(),
            status: response.status(), body: await response.json() });
        } catch { /* navigation may cancel a response body */ }
      }
    });
    page.on("pageerror", (error) => recordDiagnostic({ type: "pageerror", message: error.message }));
    await page.exposeFunction("recordEditorState", (titles: string[]) => recordDiagnostic({ type: "ui-titles", titles }));
    await page.exposeFunction("recordEditorEvent", (event: unknown) => recordDiagnostic(event));
    await page.addInitScript(() => {
      const OriginalEventSource = window.EventSource;
      window.EventSource = class extends OriginalEventSource {
        constructor(url: string | URL, config?: EventSourceInit) {
          super(url, config);
          this.addEventListener("snapshot", (event) => {
            void (window as typeof window & { recordEditorEvent: (event: unknown) => Promise<void> }).recordEditorEvent({
              type: "realtime-snapshot", body: JSON.parse((event as MessageEvent).data),
            });
          });
        }
      };
      let previous = "";
      const observer = new MutationObserver(() => {
        const titles = Array.from(document.querySelectorAll('[data-testid="activity-card"] h3')).map((node) => node.textContent || "");
        const key = JSON.stringify(titles);
        if (key === previous) return;
        previous = key;
        void (window as typeof window & { recordEditorState: (titles: string[]) => Promise<void> }).recordEditorState(titles);
      });
      observer.observe(document, { subtree: true, childList: true, characterData: true });
    });

    await loginAs(page, E2E_OWNER, "/itinerary");
    await dismissOnboardingIfVisible(page);
    await openItineraryEditor(page);
    await expect(page.getByTestId("itinerary-day-card").first()).toBeVisible();

    await page.getByTestId("add-activity-button").first().click();
    await page.getByTestId("activity-title-input").fill("E2E排序甲");
    await page.getByTestId("activity-time-input").fill("09:00");
    await page.getByTestId("activity-save-button").click();
    await expect(
      page.getByTestId("activity-card").filter({ hasText: "E2E排序甲" }),
    ).toBeVisible();

    await page.getByTestId("add-activity-button").first().click();
    await page.getByTestId("activity-title-input").fill("E2E排序乙");
    await page.getByTestId("activity-time-input").fill("11:00");
    await page.getByTestId("activity-save-button").click();
    await expect(
      page.getByTestId("activity-card").filter({ hasText: "E2E排序乙" }),
    ).toBeVisible();

    const handles = page
      .getByTestId("activity-card")
      .filter({ hasText: /E2E排序[甲乙]/ });
    await expect(handles).toHaveCount(2);
    await handles.nth(1).scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const from = await handles.first().boundingBox();
    const to = await handles.nth(1).boundingBox();
    recordDiagnostic({ type: "drag-boxes", from, to });
    expect(from).toBeTruthy();
    expect(to).toBeTruthy();
    await page.mouse.move(from!.x + 20, from!.y + 20);
    await page.mouse.down();
    await page.mouse.move(from!.x + 20, from!.y + 32, { steps: 3 });
    await page.waitForTimeout(150);
    await page.mouse.move(to!.x + 20, to!.y + to!.height / 2, { steps: 12 });
    await page.waitForTimeout(150);
    await page.mouse.up();
    await expect.poll(() => handles.allTextContents()).toEqual([
      expect.stringContaining("E2E排序乙"), expect.stringContaining("E2E排序甲"),
    ]);

    const cardA = page.getByTestId("activity-card").filter({ hasText: "E2E排序甲" });
    const orderAfterDrag = await page.evaluate(() => {
      const titles = Array.from(
        document.querySelectorAll('[data-testid="activity-card"] h3'),
      ).map((el) => el.textContent?.trim() || "");
      return titles;
    });
    writeArtifactJson("editor-reorder-report.json", {
      headingsAfterDrag: orderAfterDrag,
    });

    const editTarget = cardA.first();
    await editTarget.hover();
    await editTarget.getByTestId("activity-toolbar-edit").click({ force: true });
    await expect(editTarget.getByTestId("activity-edit-title-input")).toBeVisible();
    await editTarget.getByTestId("activity-edit-title-input").fill("E2E排序甲改名");
    await editTarget.getByTestId("activity-edit-save-button").click();
    await expect(
      page.getByTestId("activity-card").filter({ hasText: "E2E排序甲改名" }),
    ).toBeVisible();

    const deleteCandidate = page
      .getByTestId("activity-card")
      .filter({ hasText: "E2E排序乙" });
    await deleteCandidate.hover();
    await deleteCandidate.getByTestId("activity-delete-button").click();
    await page.getByRole("button", { name: "確認刪除" }).click();

    await expect(deleteCandidate).toHaveCount(0);

    // UI changes are optimistic. Confirm the saved server state before reload.
    await expect.poll(async () => {
      const days = await fetchTripItineraryFromBootstrap(page);
      const titles = days.flatMap((day) => day.items.map((item) => item.title));
      return { renamed: titles.filter((title) => title === "E2E排序甲改名").length,
        deleted: titles.includes("E2E排序乙") };
    }, { timeout: 30_000 }).toEqual({ renamed: 1, deleted: false });

    await page.screenshot({
      path: path.join(
        process.cwd(),
        "tmp/e2e-artifacts/screenshots/itinerary-editor-final.png",
      ),
      fullPage: true,
    });

    const bootstrap = page.waitForResponse(
      (res) => res.url().includes("/api/bootstrap") && res.ok(),
      { timeout: 60_000 },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await bootstrap;

    await dismissOnboardingIfVisible(page);
    await openItineraryEditor(page);

    const renamedCard = page
      .getByTestId("activity-card")
      .filter({ hasText: "E2E排序甲改名" });
    await expect(renamedCard).toHaveCount(1, { timeout: 15_000 });
    await expect(page.getByTestId("activity-card").filter({ hasText: "E2E排序乙" })).toHaveCount(0);
    const renamedAfterReload = await renamedCard.count();

    writeArtifactJson("editor-persistence-report.json", {
      renamedAfterReload,
      note:
        renamedAfterReload === 0
          ? "重整後未見更名活動：可能僅客戶端狀態或未正確等待 trips PATCH／bootstrap"
          : "ok",
    });

    expect(renamedAfterReload).toBe(1);
  });
});
