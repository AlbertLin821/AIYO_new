import type { Page } from "@playwright/test";

/**
 * `fetchVideoRecommendations` 使用 GET。首頁另有依「目的地／天數／偏好」的 GET（無 keyword）。
 * 使用者送出關鍵字搜尋時請求會帶上 `keyword` 參數，以此區分。
 */
export function waitForRecommendationsKeywordSearchResponse(
  page: Page,
  timeoutMs = 300_000,
) {
  return page.waitForResponse(
    (res) => {
      if (res.request().method() !== "GET") {
        return false;
      }
      const raw = res.url();
      if (!raw.includes("/api/videos/recommendations")) {
        return false;
      }
      try {
        const kw = new URL(raw).searchParams.get("keyword");
        return kw != null && kw.trim().length > 0;
      } catch {
        return false;
      }
    },
    { timeout: timeoutMs },
  );
}
