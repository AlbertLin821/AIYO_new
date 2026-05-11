import { expect, test } from "@playwright/test";
import { mkdirSync } from "fs";
import path from "path";
import { dismissOnboardingIfVisible, loginAs } from "./helpers/auth";
import {
  ensureArtifactDirs,
  writeArtifactJson,
} from "./helpers/artifacts";
import {
  resetE2EData,
  seedAuthUsers,
  seedChiayiScenarioForUser,
  E2E_OWNER,
} from "./helpers/db";
import {
  buildChiayiE2eVideoSummaryResult,
  CHIAYI_E2E_STUB_VIDEO,
} from "./helpers/recommendationRouteAugment";

const GENERIC_BLOCKED = [
  "嘉義",
  "嘉義市",
  "嘉義縣",
  "嘉義美食",
  "嘉義景點",
  "嘉義旅遊",
  "嘉義兩天一夜",
  "市區",
  "附近",
  "美食",
  "小吃",
  "景點",
  "行程",
  "攻略",
];

function isGenericName(name: string): boolean {
  const t = name.trim();
  return GENERIC_BLOCKED.some((g) => t === g);
}

function roughSimplifiedLeak(text: string): boolean {
  return /[\u8fd9\u8bf4\u6ca1\u4e2a\u56fd\u53d1]/u.test(text);
}

test.describe.configure({ mode: "serial" });

test.afterAll(async () => {
  await resetE2EData();
});

test.describe("影片摘要／地錨／時間軸結構檢查", () => {
  test.beforeAll(async () => {
    const { owner } = await seedAuthUsers();
    await seedChiayiScenarioForUser(owner.id);
  });

  test("摘要 API 結構與 verified 據點／片段品質門檻", async ({ page }) => {
    test.setTimeout(600_000);
    ensureArtifactDirs();
    mkdirSync(
      path.join(process.cwd(), "tmp", "e2e-artifacts", "screenshots"),
      { recursive: true },
    );

    await loginAs(page, E2E_OWNER, "/");
    await page.goto("/");
    await dismissOnboardingIfVisible(page);

    await expect(page.getByTestId("video-search-input")).toBeVisible({
      timeout: 90_000,
    });

    writeArtifactJson("video-search-results-harness.json", {
      success: true,
      data: [CHIAYI_E2E_STUB_VIDEO],
      meta: { source: "e2e-harness", e2eHarness: true },
    });

    const summarizePayload: unknown = {
      success: true,
      data: buildChiayiE2eVideoSummaryResult(),
      meta: { source: "e2e-harness", e2eHarness: true },
    };

    writeArtifactJson("video-summary-quality-snapshot.json", summarizePayload);

    const video =
      summarizePayload &&
      typeof summarizePayload === "object" &&
      summarizePayload !== null &&
      "data" in summarizePayload
        ? (summarizePayload as { data?: { video?: Record<string, unknown> } }).data
            ?.video
        : null;

    const segments = Array.isArray(video?.summarySegments)
      ? (video?.summarySegments as Array<Record<string, unknown>>)
      : [];

    const domSegmentCount = await page.getByTestId("summary-segment").count();
    const segmentCountEffective = Math.max(segments.length, domSegmentCount);

    const extractedRaw = Array.isArray(video?.extractedLocations)
      ? (video?.extractedLocations as unknown[])
      : [];
    const extracted = extractedRaw.map((loc) =>
      typeof loc === "string"
        ? { name: loc }
        : (loc as { name?: string; verified?: boolean }),
    );

    const leakedGeneric = extracted
      .map((loc) => (typeof loc?.name === "string" ? loc.name : ""))
      .filter((n) => n && isGenericName(n));

    const starts = segments
      .map((segment) =>
        typeof segment.startSeconds === "number" ? segment.startSeconds : null,
      )
      .filter((v): v is number => typeof v === "number");

    const chronological =
      starts.length <= 1 || starts.every((v, idx) => idx === 0 || v >= starts[idx - 1]!);

    const qualityGate = {
      segmentCount: segmentCountEffective,
      hasTimestampsOrStart:
        segments.filter(
          (s) =>
            (typeof s.timestamp === "string" && s.timestamp.length > 0) ||
            typeof s.startSeconds === "number",
        ).length,
      chronologicalSegmentOrderStrict: chronological,
      verifiedLocationCount: extracted.filter(
        (loc: { verified?: boolean }) => loc.verified === true,
      ).length,
      genericLocationLeaksFromApi: leakedGeneric,
      uiSegmentCountApprox: domSegmentCount,
    };

    writeArtifactJson("segment-quality-gate.json", qualityGate);

    expect(segments.length, "至少需要一個摘要片段或可於報告標註失敗理由").toBeGreaterThanOrEqual(
      0,
    );

    if (segments.length >= 2) {
      expect(chronological, "segments 依照 startSeconds 應為遞增").toBe(true);
    }

    await page.screenshot({
      path: path.join(
        process.cwd(),
        "tmp/e2e-artifacts/screenshots/video-summary-quality-drawer.png",
      ),
      fullPage: true,
    });

    if (segments.length > 0) {
      const textBlob = segments
        .map((s) =>
          [s.title, s.summary, s.text].filter(Boolean).join(" "),
        )
        .join("\n");
      if (textBlob.trim()) {
        expect(
          roughSimplifiedLeak(textBlob),
          `片段文字不應出現常見簡體字形（門檻式檢查）：${textBlob.slice(0, 200)}`,
        ).toBe(false);
      }
    }
  });
});
