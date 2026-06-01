# AIYO_new

本儲存庫為 AIYO 應用程式目前的主要工作區：可執行的 Next.js 應用位於 `aiyo/`，儲存庫根目錄提供共用說明與以 Docker Compose 為主的本地開發環境。

## 儲存庫結構

| 路徑 | 說明 |
|------|------|
| `aiyo/` | Next.js 16 應用程式、Prisma 綱要、遷移、種子腳本與應用層文件 |
| `docs/` | 架構說明、遷移筆記、實作報告等（若專案內有） |
| `youtube-proj/` | 舊版 YouTube 字幕／outline 參考實作（Vite＋Python server）；已於「中等」清理階段移除 |
| `vendor/mem0/` | Mem0 上游原始碼快照（已去除 `.git`），供 `docker-compose.yml` 的 `mem0-memory` 建置使用；可用環境變數 `MEM0_REPO_PATH` 覆寫 |
| `docker-compose.yml` | 本地 PostgreSQL、Redis、選用應用容器與選用 Mem0 相關服務 |
| `dev-up.ps1` | Windows 上僅啟動 Docker Compose（含 `dev` 與 `mem0` 設定檔），不安裝 npm／不檢查 Ollama |
| `dev-deploy.ps1` | Windows 開發模式一鍵部署：`npm install`、依 `aiyo/.env` 拉取缺少的 Ollama 模型、再啟動 Compose（預設含 mem0，可用參數關閉） |

## 技術棧（摘要）

- Next.js 16（App Router）、React 19、TypeScript
- Prisma + PostgreSQL（含 pgvector 映像）
- NextAuth（Google OAuth 與電子郵件／密碼）
- Ollama（伺服器端呼叫；容器內預設連到宿主 `host.docker.internal:11434`）
- 選用：Mem0 相關服務（原始碼已同捆於 `vendor/mem0/`，見下文）

---

## 開發模式（Docker）：啟動所有服務

此處的**開發模式**指：在儲存庫根目錄用 Compose **設定檔 `dev`** 啟動 **`app-dev`**，容器內執行 `npm run dev`（熱重載），並連同 **PostgreSQL**、**Redis** 一併啟動。AI 對話搜尋與行程生成使用 **Serper** 與 **Tavily**（需設定對應 API 金鑰）。

### 開發模式會啟動哪些服務？

| Compose 服務 | 容器名稱 | 說明 |
|----------------|----------|------|
| `app-dev` | `aiyo-new-app-dev` | Next.js 開發伺服器，`http://localhost:3000` |
| `postgres` | `aiyo-new-postgres` | `localhost:5432`，資料庫 `aiyo_new_db` |
| `redis` | `aiyo-new-redis` | `localhost:6379` |

**未包含在上一列指令內（可另外啟動）：**

- **pgAdmin**：`docker compose up -d pgadmin`（見下節「二、2.1」）
- **Mem0**：需 `--profile mem0`；建置內容預設使用儲存庫內 `vendor/mem0/`。多數開發者可**不啟動** Mem0，並在 `aiyo/.env` 將 `MEM0_ENABLED` 設為 `false`，避免應用連線到不存在的 `mem0-memory`。

**宿主機須另外執行（不在 Docker 內）：**

- **Ollama**：在 Windows／macOS 本機執行 `ollama serve`，並依 `aiyo/.env` 或 Compose 覆寫的模型名稱執行 `ollama pull …`。`app-dev` 預設透過 `host.docker.internal:11434` 連到宿主 Ollama。

### 記憶架構（Mem0）要不要啟動？

目前與「對話長期記憶」相關、且由本專案 **選用** 連線的外部服務，主要是 **Mem0**（`MEM0_BASE_URL` 指向的 HTTP API，Compose 內預設主機名為 `mem0-memory`）。**沒有**另一套與 Mem0 並列、卻又必須在預設開發指令裡一併啟動的「第二種記憶容器」。

| 情境 | 是否需要啟動 Mem0 容器 |
|------|-------------------------|
| `aiyo/.env` 內 **`MEM0_ENABLED=false`**（或未設定；程式預設為 `false`，見 `aiyo/src/server/config.ts`） | **不必**。聊天與行程規劃仍會執行，只是略過 Mem0 的搜尋／寫入記憶。 |
| **`MEM0_ENABLED=true`**（例如沿用 `.env.example`）且希望對話能寫入／查詢 Mem0 | **要**。需能成功建置並啟動 `--profile mem0` 下的 `mem0-memory` 等服務（預設自 `vendor/mem0/` 建置；若要改用本機其他路徑可設 `MEM0_REPO_PATH`）。 |

**與 PostgreSQL 的區別：** 行程、個人檔、聊天訊息等**主要持久化**仍由 **PostgreSQL（Prisma）** 負責；Mem0 額外提供的是可檢索的「記憶」語境（例如對話前後文補強），兩者層級不同。因此一般開發只要 DB + Redis + 應用即可；若要驗證 AI 網搜，請設定 `SERPER_API_KEY` 或 `TAVILY_API_KEY`。**只有在你明確要驗 Mem0 行為時**，才需要把 Mem0 一併拉起，或暫時關閉 `MEM0_ENABLED` 直到環境就緒。

### 啟動前檢查清單

1. **Docker Desktop** 已開啟（Windows／macOS）。
2. **`aiyo/.env` 已建立**：`docker-compose.yml` 中 `app-dev` 使用 `env_file: ./aiyo/.env`。請複製 `aiyo/.env.example` 為 `aiyo/.env`，並補上 `NEXTAUTH_SECRET` 等必填值（勿將含密鑰檔案提交至 Git）。
3. **埠 3000 未被占用**：若本機另有 `npm run dev` 或其他程式占用 `3000`，請先關閉，否則 `app-dev` 無法綁定埠。
4. **（建議）未啟 Mem0 時**：在 `aiyo/.env` 設定 `MEM0_ENABLED=false`。
5. **（選用）Google 地圖前端金鑰**：若要在開發模式使用地圖 SDK，請在**建置映像前**讓 Compose 能讀到 `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` 等（見「一、1.2」）；首次建置後若曾改動這些變數，請重新 `docker compose --env-file ./aiyo/.env --profile dev build app-dev` 再啟動。

### 啟動指令（建議：不含 Mem0）

在儲存庫**根目錄**（與 `docker-compose.yml` 同層）執行：

```bash
docker compose --env-file ./aiyo/.env --profile dev up -d --build postgres redis app-dev
```

- **首次建置**或曾修改 Dockerfile／依賴時，保留 `--build**。  
- **`--env-file ./aiyo/.env`** 與 `scripts/dev-deploy.ps1`、`dev-up.ps1` 一致，讓 Compose 的 `${…}` 替換與容器內 `OLLAMA_*`、`MEM0_*` 等與 `aiyo/.env` 對齊。  
- 上述指令會依 `depends_on` 等待 `postgres`、`redis` 健康後再啟動 `app-dev`；`app-dev` 啟動後會執行 `prisma generate`、`prisma migrate deploy`，再跑 `npm run dev`。

### 確認容器是否正常

```bash
docker compose --env-file ./aiyo/.env --profile dev ps
```

預期 **`aiyo-new-app-dev`**、**`aiyo-new-postgres`**、**`aiyo-new-redis`** 的 **STATUS** 為 **`Up`**（資料庫與 Redis 另應顯示 **`healthy`**）。若 `app-dev` 長時間非 `healthy`，請查看日誌：

```bash
docker compose --env-file ./aiyo/.env --profile dev logs -f app-dev --tail=120
```

常見問題：**資料庫連線失敗（Prisma P1001）** 多半是容器未在同一 Compose 網路；請勿只對單一容器執行 `docker start`，應一律用上面的 `docker compose --profile dev up …` 啟動（見「二、2.3」網路提醒）。

### 驗證應用程式

```bash
curl http://localhost:3000/api/health
```

瀏覽器開啟：`http://localhost:3000`。

### Windows：完整開發部署（建議）

專案根目錄執行：

```powershell
.\dev-deploy.ps1
```

會依序：`npm install`（`aiyo/`）、確認本機 Ollama 可連線並**僅拉取缺少的**模型（自 `aiyo/.env` 讀取 `OLLAMA_*`；若 `.env` 未寫某鍵則以與 `docker-compose.yml` 相同的預設 `qwen3.5:9b` 補齊；若啟用 Mem0 另含 `qwen3.5:9b`、`nomic-embed-text`）、`scripts/clone-mem0.ps1`，再以 `docker compose --env-file ./aiyo/.env` 啟動 `postgres`、`redis`、`app-dev`（及 mem0 相關容器）。若不需要 Mem0：`.\dev-deploy.ps1 -NoMem0`。

### Windows：僅 Docker（會嘗試啟動 Mem0）

專案根目錄的 `dev-up.ps1` 會：若尚無 `aiyo/.env` 則自 `aiyo/.env.example` 建立；執行 `scripts/clone-mem0.ps1`（若 `vendor/mem0/` 已存在則略過，否則嘗試自 GitHub shallow clone；失敗時請改用手動指令）；再執行：

`docker compose --env-file ./aiyo/.env --profile dev --profile mem0 up -d postgres redis mem0-memory-postgres mem0-memory app-dev`

若不需要 Mem0，請勿使用 `dev-up.ps1`，改用上節「啟動指令（建議：不含 Mem0）」的 `docker compose …`（不加 `--profile mem0`）。

### 停止開發用容器

```bash
docker compose --profile dev down
```

若僅想暫停而不刪網路／卷，可使用 `stop`；細節請參考 Docker Compose 文件。

---

## 啟動方式總覽

可依團隊習慣擇一或並用：

1. **開發模式（Docker 跑 `app-dev`）**  
   見上一節 **「開發模式（Docker）：啟動所有服務」**（PostgreSQL + Redis + `app-dev` + 宿主 Ollama）。

2. **僅資料庫／快取用 Docker，本機跑 Next**  
   在根目錄啟動 `postgres`（與選用的 `redis`），於 `aiyo/` 執行 `npm install`、`prisma migrate`、`npm run dev`。

3. **本機正式模式驗證（掛載程式碼 + 每次啟動 build）**  
   使用 `app-prod-live`（`.\prod-live-up.ps1`，profile `prod-live`），見「二、2.2.2」。

4. **應用程式在 Docker 內跑正式建置（映像內程式碼）**  
   使用 Compose 服務 `app`（`next start`，容器名 `aiyo-new-app`），見下節「二、2.1」。

以下分節說明前置需求、環境變數、資料庫與其他啟動流程。

---

## 前置需求

請先安裝：

- **Node.js** 20 或以上（專案使用 npm 與 `package-lock.json`）
- **npm**
- **Docker Desktop**（用於 PostgreSQL、Redis；選用則包含應用容器）
- **Ollama**（本機執行；容器內的應用預設改連宿主機的 Ollama）

---

## 一、環境變數與設定檔

### 1.1 檔案位置

在 `aiyo/` 目錄內：

```bash
cd aiyo
cp .env.example .env.local
```

**重要：Prisma CLI**（`prisma migrate`、`prisma generate` 等）預設讀取 **`aiyo/.env`**，**不會**自動讀 `.env.local`。因此請擇一處理：

- 在 `aiyo/` 建立 **`.env`**，至少含 `DATABASE_URL`（內容可與 `.env.local` 相同）；或  
- 每次執行 Prisma 前在終端機 **匯出** `DATABASE_URL`。

Next.js 執行時會讀 `.env.local`（與 `.env` 等 Next 規則）；建議本機開發時 **`.env` 與 `.env.local` 的 `DATABASE_URL` 保持一致**，避免 Prisma 與應用程式各指不同資料庫。

**請勿將含密鑰的檔案提交到 Git。** 本說明不涵蓋修改你本機既有 `.env` 的內容；僅說明應有哪些鍵與範例來源可參考 `aiyo/.env.example`。

### 1.2 Docker 建置與 `NEXT_PUBLIC_*`

前端在建置時會內嵌 `NEXT_PUBLIC_*` 變數。若使用 **`docker compose build`** 建映像，請在 **建置當下** 讓 Compose 能取得這些變數（例如專案根目錄的 `.env` 供 `${NEXT_PUBLIC_...}` 替換，或於建置指令的環境中提供）。僅在執行中的容器改 `env_file` 而**未重新建置**，可能無法修正已編進前端的空值。

`docker-compose.yml` 檔首註解亦說明此點；詳見官方文件：  
https://docs.docker.com/compose/how-tos/environment-variables/set-environment-variables/

### 1.3 變數清單（對照 `aiyo/.env.example`）

**建議至少設定（本機／開發）：**

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | PostgreSQL 連線字串。與 Docker 預設本機埠對應範例：`postgresql://aiyo:aiyo_password@localhost:5432/aiyo_new_db?schema=public`（應用跑在宿主、DB 在容器時主機用 `localhost`；應用跑在同一 Compose 網路內時主機名為 `postgres`，見 Compose 內 `app`／`app-dev` 的覆寫） |
| `NEXTAUTH_URL` | 本機通常為 `http://localhost:3000` |
| `NEXTAUTH_SECRET` | 請改為足夠長度的隨機字串 |
| `OLLAMA_BASE_URL` | 本機 Ollama 通常為 `http://localhost:11434`；在 Compose 的 `app`／`app-dev` 內已預設改為 `http://host.docker.internal:11434` 以連宿主 |
| `OLLAMA_MODEL` | 與 `ollama pull` 的模型名稱一致；`.env.example` 預設為較大模型，Compose 內對未設環境變數的預設常為 `qwen3.5:9b`（以 `docker-compose.yml` 為準） |

**Ollama 相關（影片摘要、地點等流程）：**

| 變數 | 說明（預設見 `.env.example`） |
|------|------------------------------|
| `OLLAMA_TRIP_PLAN_MODEL` | 語音／行程規劃 API（`task: trip-plan`）產生 JSON 用模型；未設定則同 `OLLAMA_MODEL`（`.env.example` 預設 `gemma4:e4b`） |
| `OLLAMA_VIDEO_SUMMARY_MODEL` | 影片摘要用模型 |
| `OLLAMA_VIDEO_SUMMARY_FAST_MODEL` | 較快階段用模型 |
| `OLLAMA_VIDEO_SUMMARY_FINAL_MODEL` | 彙整／定稿用模型 |
| `OLLAMA_LOCATION_MODEL` | 地點相關推論用模型 |
| `OLLAMA_TIMEOUT_MS` | 逾時毫秒 |
| `OLLAMA_KEEP_ALIVE` | 模型常駐 VRAM（預設 `-1`）；任務仍由 `resolveModelForTask` 自動選模型 |

**Mem0（記憶／檢索；`docker-compose.yml` 與 `.env.example`）：**

| 變數 | 說明 |
|------|------|
| `MEM0_BASE_URL` | Mem0 HTTP 服務位址；本機預設範例 `http://localhost:8890`，Compose 內應用服務常指向 `http://mem0-memory:8000` |
| `MEM0_ENABLED` | 是否啟用 |
| `MEM0_TOP_K` | 取回筆數上限等 |
| `MEM0_TIMEOUT_MS` | 逾時 |

**選用：Google／YouTube／地圖**

| 變數 | 說明 |
|------|------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google 登入 |
| `YOUTUBE_API_KEY` | YouTube Data API v3 |
| `GOOGLE_MAPS_API_KEY` | 伺服器端（例如 Geocoding） |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 瀏覽器端 Maps JavaScript API |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | 選用；向量地圖與 `AdvancedMarkerElement`；未設定時會退回傳統標記 |

**其他：**

| 變數 | 說明 |
|------|------|
| `NEXT_PUBLIC_APP_NAME` | 應用顯示名稱等 |
| `ENABLE_MOCK_VIDEO_PROVIDER` | 設為 `true` 時強制使用本地假資料影片來源 |
| `ENABLE_MOCK_MAPS` | 保留；地圖是否在無金鑰等情況自動降級請以程式行為為準 |

---

## 二、使用 Docker 啟動基礎設施與應用

### 2.1 預設服務（不含 `profiles` 的服務）

在儲存庫**根目錄**執行：

```bash
docker compose up -d --build
```

通常會啟動（服務名稱／容器名稱以 `docker-compose.yml` 為準）：

- **PostgreSQL**：`postgres`／`aiyo-new-postgres`，埠 `localhost:5432`，資料庫 `aiyo_new_db`，使用者 `aiyo`，密碼 `aiyo_password`
- **Redis**：`redis`／`aiyo-new-redis`，埠 `localhost:6379`
- **pgAdmin**：`pgadmin`／`aiyo-new-pgadmin`，網頁 `http://localhost:5050`（預設帳密見 Compose 檔内 `PGADMIN_DEFAULT_*`）
- **Next 應用（`app`）**：`aiyo-new-app`，網頁 `http://localhost:3000`；啟動命令含 `prisma migrate deploy` 後執行 `next start`

健康檢查可測：

```bash
curl http://localhost:3000/api/health
```

### 2.2 開發模式（熱重載，`app-dev`）

完整步驟、檢查清單、驗證方式與 `dev-up.ps1` 差異請見本文最前段的 **「開發模式（Docker）：啟動所有服務」**。此處僅摘要指令：

```bash
docker compose --profile dev up -d --build postgres redis app-dev
```

`app-dev` 會掛載 `./aiyo` 到容器內，並將 `.next` 綁到宿主 `./aiyo/.next`；啟動流程含 `prisma generate`、`prisma migrate deploy` 後再執行 `npm run dev`。

### 2.2.1 三種應用容器對照

| 模式 | Compose 服務 | Profile | 程式碼 | 執行方式 | 容器名 |
|------|----------------|---------|--------|----------|--------|
| **開發（熱重載）** | `app-dev` | `dev` | 掛載 `./aiyo` | `npm run dev` | `aiyo-new-app-dev` |
| **本機正式驗證** | `app-prod-live` | `prod-live` | 掛載 `./aiyo` | 每次啟動：`npm run build` → `npm run start` | `aiyo-new-app-prod-live` |
| **映像正式版** | `app` | （預設） | 映像內（需 `docker compose build app`） | `next start` | `aiyo-new-app` |

`app-dev` 與 `app-prod-live` **共用埠 3000**，請二擇一啟動。切換模式時若前端資源異常，可刪除本機 `./aiyo/.next` 後再啟動。

### 2.2.2 Prod-live（本機正式模式驗證）

用於在本機驗證接近正式環境的行為（`NODE_ENV=production`、`next start`），仍掛載原始碼；**不會**自動 `git pull`，請自行更新程式後重跑腳本。

**啟動（儲存庫根目錄）：**

```powershell
.\prod-live-up.ps1
```

等同於（不含 Mem0）：

```bash
docker compose --env-file ./aiyo/.env --profile prod-live up -d --build postgres redis app-prod-live
```

- 首次或改動程式後需重新執行 `prod-live-up.ps1`（或 `docker compose … up -d --force-recreate app-prod-live`），容器才會重新 `npm run build`。
- 若 `app-dev` 仍在跑，腳本會提示先 `docker compose --env-file ./aiyo/.env --profile dev down`。
- 需要 Mem0：`.\prod-live-up.ps1 -WithMem0`。
- `NEXT_PUBLIC_*` 在容器內 build 時從掛載的 `aiyo/.env` 讀取；變更後請重啟 prod-live 以觸發重新 build。

**驗證：**

```bash
curl http://localhost:3000/api/health
```

**切回開發：**

```bash
docker compose --env-file ./aiyo/.env --profile prod-live down
.\dev-up.ps1
```

（或改用不含 Mem0 的 `docker compose --profile dev up …`。）

### 2.3 Mem0 設定檔（`mem0`）與 `dev-up.ps1` 注意事項

`docker-compose.yml` 內 **`mem0-memory`** 的建置內容預設為 **`./vendor/mem0`**（與本儲存庫一併版本化，clone 後即可建置）。若要以本機其他目錄取代，請設定環境變數 **`MEM0_REPO_PATH`** 覆寫 Compose 的 `context`。

團隊成員若暫不需要 Mem0，可僅啟動應用與 DB／Redis（不使用 `mem0` 設定檔），並將 `MEM0_ENABLED` 設為 `false` 或調整 `MEM0_BASE_URL`。

**網路提醒：** 註解說明請透過 `docker compose` 或 `dev-up.ps1` 啟動，避免只對單一容器 `docker start`，以免容器未接上 Compose 建立的 `backend` 網路而無法解析主機名 `postgres`、`redis` 等。

---

## 三、本機跑 Next（Docker 只負責 PostgreSQL／Redis）

適合在本機除錯、跑 Playwright 或較快迭代。

### 3.1 啟動資料庫（與選用 Redis）

在儲存庫根目錄：

```bash
docker compose up -d postgres redis
```

（若也需要 pgAdmin，可加上 `pgadmin`。）

### 3.2 安裝依賴與資料庫遷移

```bash
cd aiyo
npm install
npm run prisma:generate
npx prisma migrate deploy
npm run db:seed
```

`DATABASE_URL` 請指向 `localhost:5432` 的 `aiyo_new_db`（與上節 Docker 預設一致）。

### 3.3 啟動 Ollama

另開終端機：

```bash
ollama serve
```

並依 `.env` 中所設模型名稱拉取映像，例如（請與你的 `OLLAMA_MODEL` 等一致）：

```bash
ollama pull qwen3.5:9b
```

若使用 `.env.example` 中的大型模型名稱，請改為你機器可負荷的模型或調整變數。

### 3.4 啟動開發伺服器

```bash
cd aiyo
npm run dev
```

瀏覽器開啟：`http://localhost:3000`。

---

## 四、遷移失敗時的備援（手動執行 SQL）

若全新環境上 `npx prisma migrate deploy` 失敗，可改為依序手動執行遷移檔（路徑與檔名以儲存庫內 `aiyo/prisma/migrations/` 為準），例如歷史檔：

```bash
cd aiyo
npx prisma db execute --file prisma/migrations/20260416_000001_phase3_init/migration.sql --schema prisma/schema.prisma
npx prisma db execute --file prisma/migrations/20260416_000002_add_password_hash/migration.sql --schema prisma/schema.prisma
```

之後若有新增遷移目錄，請依時間序補執行。**若資料庫內已有舊版非 Prisma 綱要，遷移可能衝突**；建議開發用專用資料庫 `aiyo_new_db`。

---

## 五、啟動後建議驗證項目

- **驗證後端與資料庫**：`GET http://localhost:3000/api/health`
- **驗證登入**：未登入造訪 `/profile` 應導向 `/login`；可用 Google（需設定 OAuth）或電子郵件註冊／登入  
  - Google OAuth 重新導向 URI 範例：`http://localhost:3000/api/auth/callback/google`
- **驗證持久化**：於 `/profile` 修改後重新整理；於 `/itinerary` 編輯後重新整理應保留
- **驗證協作／即時**：兩個視窗同一使用者，於 `/collaborate`（或導向後的行程頁面）操作，另一視窗應於下次快照更新時反映（實際間隔依實作為準）
- **若 API 回傳 401**：檢查是否已登入，以及 `NEXTAUTH_SECRET`、`NEXTAUTH_URL` 是否設定正確
- **若聊天／規劃失敗**：確認 Ollama 已啟動、`OLLAMA_BASE_URL` 正確，且 `OLLAMA_MODEL` 等已 `ollama pull`

---

## 六、日常開發約定

- 請以本儲存庫根目錄的 **`docker-compose.yml`** 作為團隊共用的 Docker 基準；**不要**假設舊儲存庫 `../AIYO/docker-compose.yml` 仍為唯一標準。
- 一般功能開發需要 **PostgreSQL**；Redis 與 pgAdmin 依 Compose 提供，應用是否強制依賴 Redis 請以程式與部署設定為準。
- 本機腳本：`npm run dev` 使用 `next dev --webpack`（見 `aiyo/package.json`）。

---

## 七、應用能力摘要

- AI 對話與行程規劃相關 API 與頁面
- 以 Prisma 寫入 PostgreSQL
- NextAuth（Google 與憑證登入）
- 協作室留言、在線狀態與即時串流端點
- 影片推薦與摘要流程
- Google Maps 與 YouTube 整合（可搭配後端／公開金鑰與降級行為）

---

## 八、延伸閱讀

| 文件 | 內容 |
|------|------|
| `aiyo/README.md` | 應用目錄結構、主要 API 路由、環境變數補充 |
| `docs/README.md` | 專案層 `docs/` 目錄索引 |
| `aiyo/docs/README.md` | 應用層文件與 `testing/` 子目錄索引 |
| `aiyo/docs/startup.md` | 捷徑至本檔（完整啟動步驟以本 README 為準） |
| `docs/docker_dev_migration.md` | 既有機器遷移到本儲存庫 Docker 流程 |
| `docs/architecture.md` | 架構摘要 |
| `docs/implementation_report.md` | 實作報告 |
| `docs/aiyo_migration_analysis.md` | 自舊儲存庫遷移的分析紀錄 |
| `aiyo/docs/phase3_production_upgrade_report.md` | 升級與上線相關筆記 |
| `aiyo/docs/ollama-prompts.md` | Ollama prompt／呼叫鏈／模型環境變數說明 |
