# AIYO_new

`AIYO_new` 目前分成兩層：

- `docs/`：遷移分析、架構說明、實作報告
- `aiyo/`：實際執行的 Next.js 應用（含 BFF API、Ollama、Prisma、NextAuth）

## 專案結構

- `AIYO_new/README.md`：總覽與部署啟動指引（本文件）
- `AIYO_new/aiyo/README.md`：應用層細節
- `AIYO_new/docs/`：架構與遷移文件

## 部署與啟動（本機開發）

### 1) 進入應用目錄

```bash
cd aiyo
```

### 2) 建立環境變數檔

```bash
cp .env.example .env.local
```

最少需要確認以下變數：

- `DATABASE_URL`
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `OLLAMA_BASE_URL`
- `OLLAMA_MODEL`

### 3) 啟動 PostgreSQL

可重用既有 `AIYO` 的 Docker Compose 服務：

```bash
cd ../..
cd AIYO
docker compose -f docker-compose.yml up -d postgres
```

首次建立專用資料庫：

```bash
docker exec aiyo-postgres psql -U aiyo -d postgres -c "CREATE DATABASE aiyo_new_db;"
```

### 4) 回到應用目錄並初始化資料庫

```bash
cd ../AIYO_new/aiyo
npm install
npm run prisma:generate
npx prisma db execute --file prisma/migrations/20260416_phase3_init/migration.sql --schema prisma/schema.prisma
npm run db:seed
```

### 5) 啟動 Ollama

```bash
ollama serve
ollama pull gemma3:4b
```

### 6) 啟動開發伺服器

```bash
npm run dev
```

開啟 `http://localhost:3000`。

## 部署與啟動（正式模式）

在 `AIYO_new/aiyo` 目錄執行：

```bash
npm install
npm run build
npm run start
```

正式模式同樣需要可用的：

- PostgreSQL
- Ollama（或你指定的相容模型服務）
- 完整 `.env.local` 設定

## 快速檢查

啟動後可先驗證：

- 首頁可正常載入
- `POST /api/ai/chat` 可回應
- `POST /api/ai/plan` 可產生行程
- 個人頁/行程頁在登入狀態可正常讀寫

## 重要文件

- 遷移分析：`docs/aiyo_migration_analysis.md`
- 架構說明：`docs/architecture.md`
- 實作報告：`docs/implementation_report.md`

## 程式碼位置

本次遷移的應用程式碼集中在 `aiyo/`。
