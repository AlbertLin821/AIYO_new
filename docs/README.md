# 專案文件索引

文件分為現況說明與歷史紀錄。現況文件以 2026-10-04 的程式核對；歷史報告保留原始時點的結論，不能把各階段通過數字相加，或把選型提案當成已導入功能。

## 現況文件

| 文件 | 內容 |
| --- | --- |
| [architecture.md](architecture.md) | 模組責任、模型／影片／記憶資料流、一致性及擴充限制 |
| [setup.md](setup.md) | 環境、宿主機／容器啟動、worker、連接埠與故障定位 |
| [data-and-api.md](data-and-api.md) | Prisma 實體、保存與公開快照、路由及權限 |
| [engineering-decisions.md](engineering-decisions.md) | 問題、修正、取捨與可研究方向 |
| [evaluation.md](evaluation.md) | 測試層次、命令、歷史結果與評估規劃 |
| [documentation-review-2026-10-04.md](documentation-review-2026-10-04.md) | 本次文件核對範圍與實際檢查結果 |
| [SECURITY_CREDENTIAL_ROTATION.md](SECURITY_CREDENTIAL_ROTATION.md) | 既有密鑰輪替處置說明 |

## 歷史研究、遷移與實作紀錄

| 文件 | 閱讀範圍 |
| --- | --- |
| [deep-research-report.md](deep-research-report.md) | 當時 Docker／Open WebUI 研究，不是現行部署指南 |
| [docker-migration-inventory.md](docker-migration-inventory.md) | 遷移盤點與資產處理 |
| [docker-legacy-assets.md](docker-legacy-assets.md) | 封存紀錄；Mem0 原始碼目前仍被 Dockerfile 使用 |
| [docker-rollback.md](docker-rollback.md) | 舊遷移的回退程序，執行前需對照現有服務與備份 |
| [docker_dev_migration.md](docker_dev_migration.md) | 舊版服務拓樸與遷移摘要 |
| [implementation_report.md](implementation_report.md) | 初期功能整合報告 |
| [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) | 既有實作筆記 |
| [aiyo_migration_analysis.md](aiyo_migration_analysis.md) | 舊儲存庫遷移分析 |
| [AIYO_ONYX_GAP_REPORT.md](AIYO_ONYX_GAP_REPORT.md) | 當時能力差異分析 |

應用層的影片、對話及各階段驗證報告，見 [aiyo/docs/README.md](../aiyo/docs/README.md)。全專案入口為 [README](../README.md)。
