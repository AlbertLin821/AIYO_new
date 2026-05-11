import type { Page } from "@playwright/test";

export type SummarizeEvidence =
  | { from: "api"; json: unknown }
  | { from: "ui" }
  | { from: "miss" };

/**
 * 必須在點選影片卡片「之前」呼叫，才抓得到並行的 POST summarize。
 */
export function beginSummarizeResponseWatch(
  page: Page,
  timeoutMs: number,
): Promise<SummarizeEvidence> {
  return page
    .waitForResponse(
      (r) =>
        r.url().includes("/api/videos/summarize") &&
        r.request().method() === "POST",
      { timeout: timeoutMs },
    )
    .then(async (res) => {
      try {
        return { from: "api" as const, json: await res.json() };
      } catch {
        return { from: "api" as const, json: { parseError: true } };
      }
    })
    .catch(() => ({ from: "miss" as const }));
}

/** 摘要片段出現在抽屜內（可能被快取繞過 API）。抽屜顯示後再呼叫。 */
export function beginSummarySegmentWatch(
  page: Page,
  timeoutMs: number,
): Promise<SummarizeEvidence> {
  return page
    .getByTestId("summary-segment")
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => ({ from: "ui" as const }))
    .catch(() => ({ from: "miss" as const }));
}
