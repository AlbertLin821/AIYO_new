import type { Page } from "@playwright/test";
import { installVideoApisE2EHarness } from "./recommendationRouteAugment";

/** UI 合約測試預設載入路由攔截；設為 `0` 或 `false` 時關閉以測試真實 YouTube／摘要 API。 */
export function isVideoApiHarnessEnabled(): boolean {
  const v = process.env.PLAYWRIGHT_USE_VIDEO_API_HARNESS;
  return v !== "0" && v !== "false";
}

/** 只在啟用環境變數時安裝 recommendations + summarize harness */
export async function installVideoApisHarnessWhenEnvEnabled(page: Page): Promise<void> {
  if (!isVideoApiHarnessEnabled()) {
    return;
  }
  await installVideoApisE2EHarness(page);
}
