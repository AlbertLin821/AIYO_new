# AIYO 應用程式開發

本目錄是 AIYO 的 Next.js 應用，包含瀏覽器介面、API、規劃服務、資料模型與測試。專案動機、功能與成果見[根目錄 README](../README.md)；完整啟動方式以[部署指南](../docs/setup.md)為準。

## 開發入口

| 路徑 | 責任 |
| --- | --- |
| [src/app](src/app) | App Router 頁面與 API |
| [src/components](src/components) | 聊天、行程、地圖與影片元件 |
| [src/stores](src/stores) | Zustand 互動狀態 |
| [src/services](src/services) | 前端 API client、同步、影片匯入 |
| [src/server](src/server) | 規劃、搜尋、記憶、地理與工作佇列 |
| [src/types/index.ts](src/types/index.ts) | 共用資料契約 |
| [prisma/schema.prisma](prisma/schema.prisma) | 主資料庫 schema |
| [prisma/migrations](prisma/migrations) | 已提交 migration |
| [tests](tests) | 整合與 Playwright 測試 |
| [scripts](scripts) | 啟動 helper、worker、資料準備與驗證 |

修改前閱讀 [AGENTS.md](AGENTS.md)。目前使用 Next.js 16、React 19；修改框架行為時應參考本機安裝版本的文件。

## 常用命令

從本目錄執行，先依部署指南備妥環境檔及相依服務：

```powershell
npm ci
npm run prisma:generate
node scripts/copy-maplibre-worker.mjs
npx tsx scripts/start-local-stack.ts migrate
npx tsx scripts/start-local-stack.ts app
```

另一個終端：

```powershell
npx tsx scripts/start-local-stack.ts worker
```

worker 同時處理影片分析與記憶寫入。直接執行 `npm run worker:video` 不會進行容器 hostname 的宿主機轉換，適用於位址已正確配置的環境。

```powershell
npm test
npm run lint
npm run build
npx tsc --noEmit
```

單元測試不包含所有 DB 整合或瀏覽器測試；規劃、影片與 live 模型驗證見[測試與評估](../docs/evaluation.md)。不可在真實使用者資料庫執行測試資料重置。

## 環境與工作目錄

本機設定使用未提交的 `.env.dev`／`.env.prod-live`；可提交範本為 [.env.dev.example](.env.dev.example) 與 [.env.prod-live.example](.env.prod-live.example)。不連結不存在於 GitHub 的私人環境檔，也不要把真實內容貼到 issue。

`src/lib/projectEnv.ts` 控制專案設定來源，`src/server/config.ts` 決定模型與供應者設定。宿主機 helper、Compose、Playwright 各自有啟動前提，不能假設任何 npm 命令都會自動轉換網路位址。

## 功能修改的檢查點

對話修改需一併檢查意圖、schema、執行結果與持久化；地點替換需處理舊座標；背景補全需檢查版本；新增 provider 要有逾時、缺值與失敗降級。新增 UI 狀態時確認重新整理、切換行程與切換帳號後的行為。

更多說明：[系統架構](../docs/architecture.md)、[資料與 API](../docs/data-and-api.md)、[工程決策](../docs/engineering-decisions.md)、[貢獻指南](../CONTRIBUTING.md)。
