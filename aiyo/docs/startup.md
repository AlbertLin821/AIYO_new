# 本機啟動（精簡說明）

完整前置需求、Docker Compose、`app`／`app-dev`、環境變數與 Prisma 注意事項，請以儲存庫根目錄說明為準：

**[../../README.md](../../README.md)**

本檔僅保留捷徑，避免與根目錄 `docker-compose.yml` 及 `README.md` 內容重複維護。

若需讓影片摘要寫入資料庫快取（`video_summary_caches`），請在 `aiyo` 目錄執行 `npx prisma migrate deploy`（或開發用 `migrate dev`），與根目錄 README 的資料庫步驟一致。
