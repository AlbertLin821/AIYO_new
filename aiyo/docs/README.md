# 應用層文件索引（`aiyo/docs/`）

| 路徑 | 說明 |
|------|------|
| [startup.md](./startup.md) | 捷徑：指向根目錄 [README.md](../../README.md)（完整啟動步驟） |
| [video-place-extraction.md](./video-place-extraction.md) | 影片地點擷取 deterministic pipeline、quality gate、canonicalization、dedupe、verification 與 fallback |
| [phase3_production_upgrade_report.md](./phase3_production_upgrade_report.md) | Phase 3 升級與上線相關筆記 |
| [phase36_stability_and_mock_removal_report.md](./phase36_stability_and_mock_removal_report.md) | 穩定性與 mock 移除報告 |
| [mock-audit-phase36.md](./mock-audit-phase36.md) | Mock 稽核（Phase 3.6） |
| [video-poi-extraction-redesign.md](./video-poi-extraction-redesign.md) | 影片 POI 擷取改版說明 |
| [youtube-transcript-migration-report.md](./youtube-transcript-migration-report.md) | YouTube 逐字稿遷移報告 |
| [ollama-prompts.md](./ollama-prompts.md) | Ollama 呼叫鏈、全域 system、已／未接線 prompt 與環境變數說明 |
| [qa_test_report.md](./qa_test_report.md) | QA 驗證報告（單次彙整） |
| [testing/](./testing/) | 測試計畫、品質報告、技術債紀錄（見下表） |

## `testing/` 子目錄

| 檔案 | 說明 |
|------|------|
| [video-analysis-test-plan.md](./testing/video-analysis-test-plan.md) | 影片分析 pipeline 測試計畫（含手動驗收要點） |
| [full-user-simulation-test-plan.md](./testing/full-user-simulation-test-plan.md) | 完整使用者流程模擬測試計畫 |
| [full-user-simulation-report.md](./testing/full-user-simulation-report.md) | 模擬測試執行報告 |
| [live-api-final-validation-report.md](./testing/live-api-final-validation-report.md) | Live API 驗證報告 |
| [location-geocode-quality-report.md](./testing/location-geocode-quality-report.md) | 地理編碼品質報告 |
| [video-map-itinerary-quality-report.md](./testing/video-map-itinerary-quality-report.md) | 影片、地圖與行程品質報告 |
| [google-maps-technical-debt.md](./testing/google-maps-technical-debt.md) | Google Maps 技術債追蹤 |

已刪除：根目錄重複的長篇測試規格草稿（原 `test.md`）、一次性 Browser MCP 除錯紀錄（原 `browsermcp-flow-test-log.md`）。
