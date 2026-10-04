# 應用文件與驗證紀錄

目前架構與部署以[根目錄文件索引](../../docs/README.md)為準。本目錄保留功能設計與階段驗證；每份報告只支持它記錄的版本、案例與執行條件。

## 最近的跨功能紀錄

| 文件 | 範圍 |
| --- | --- |
| [optimization-verification-2026-09-21.md](optimization-verification-2026-09-21.md) | 已實作與實際驗證；包含失敗、修正後複測及延遲限制 |
| [optimization-audit-2026-09-21.md](optimization-audit-2026-09-21.md) | 稽核與技術選型；其中提案不全是已完成項目 |
| [redeployment-verification-2026-09-10.md](redeployment-verification-2026-09-10.md) | 該次重新部署的環境與結果 |
| [startup.md](startup.md) | 現行部署文件入口 |

## 對話與資料一致性

| 文件 | 範圍 |
| --- | --- |
| [qa/conversation-architecture-map.md](qa/conversation-architecture-map.md) | 對話路徑盤點 |
| [qa/conversation-baseline-report.md](qa/conversation-baseline-report.md) | 修復前基準 |
| [qa/conversation-remediation-report.md](qa/conversation-remediation-report.md) | 確認防護、交易、冪等及部分失敗修正 |
| [qa/conversation-test-matrix.md](qa/conversation-test-matrix.md) | 對話測試矩陣 |
| [qa/conversation-capability-gaps.md](qa/conversation-capability-gaps.md) | 當時能力缺口，需與後續修正交叉比對 |

## 影片與地理資訊

| 文件 | 範圍 |
| --- | --- |
| [video-place-extraction.md](video-place-extraction.md) | 地點擷取、品質閘門與去重設計 |
| [video-poi-extraction-redesign.md](video-poi-extraction-redesign.md) | 地點抽取重設計 |
| [youtube-transcript-migration-report.md](youtube-transcript-migration-report.md) | 字幕來源遷移 |
| [testing/video-analysis-test-plan.md](testing/video-analysis-test-plan.md) | 影片測試規劃 |
| [testing/location-geocode-quality-report.md](testing/location-geocode-quality-report.md) | 地點清理、地理驗證與當次測試 |
| [testing/video-map-itinerary-quality-report.md](testing/video-map-itinerary-quality-report.md) | 影片匯入地圖／行程的品質紀錄 |
| [testing/global-video-benchmark.md](testing/global-video-benchmark.md) | 影片基準相關紀錄 |
| [testing/preloaded-destination-videos.md](testing/preloaded-destination-videos.md) | 預載影片資料流程 |
| [testing/google-maps-technical-debt.md](testing/google-maps-technical-debt.md) | 舊 Google Maps 路徑技術債；目前主地圖為 MapLibre |

## 早期階段與其他紀錄

[Phase 3](phase3_production_upgrade_report.md)、[Phase 3.6](phase36_stability_and_mock_removal_report.md)、[Mock 稽核](mock-audit-phase36.md)、[QA 報告](qa_test_report.md)、[完整流程計畫](testing/full-user-simulation-test-plan.md)、[完整流程報告](testing/full-user-simulation-report.md)、[Live API 報告](testing/live-api-final-validation-report.md)保留各次開發背景，不能作為目前全功能驗收的替代。

[Ollama prompt 說明](ollama-prompts.md)為較早的呼叫鏈筆記；現在另有 Open WebUI client、影片抽取與串流路徑，請從[現況架構](../../docs/architecture.md)及原始碼追查。
