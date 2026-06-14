# AIYO_new

`AIYO_new` 是目前使用中的 AIYO 旅遊規劃專案。主應用程式在 [aiyo/](./aiyo)，repo root 則負責 Docker、啟動腳本、環境變數範本與跨服務部署流程。

這份 README 的目標是讓你可以從零開始把整套環境部署起來，包含：

- `aiyo-new-app-dev` 開發站
- `aiyo-new-app-prod-live` 模擬正式站
- `Postgres`
- `Redis`
- `mem0`
- `mem0` 專用 Postgres
- `Open WebUI`
- 宿主機上的 `Ollama`

如果你只想看 app 內部開發說明，可以再看 [aiyo/README.md](./aiyo/README.md)。

## 架構總覽

目前本機部署拓樸如下：

1. 使用者透過瀏覽器進入 AIYO 前端。
2. AIYO 後端讀取 `aiyo/.env.dev` 或 `aiyo/.env.prod-live`。
3. 主要聊天與規劃模型呼叫走 `Open WebUI API`。
4. `Open WebUI` 再去連宿主機上的 `Ollama`。
5. AIYO 主資料存在 `aiyo-new-postgres`。
6. 快取與部分即時狀態使用 `aiyo-new-redis`。
7. 記憶功能使用 `aiyo-new-mem0`，其向量/記憶資料存在 `aiyo-new-mem0-postgres`。

## 服務與連接埠

| 服務 | 容器名稱 | 用途 | 本機位址 |
|------|------|------|------|
| Dev app | `aiyo-new-app-dev` | 開發用前端/後端 | `http://127.0.0.1:3000` |
| Prod-live app | `aiyo-new-app-prod-live` | 模擬正式環境 | `http://127.0.0.1:3001` |
| Open WebUI | `open-webui` | AI gateway 與模型 API | `http://127.0.0.1:8080` |
| Main Postgres | `aiyo-new-postgres` | AIYO 主資料庫 | `127.0.0.1:5432` |
| Redis | `aiyo-new-redis` | 快取/即時狀態 | `127.0.0.1:6379` |
| mem0 API | `aiyo-new-mem0` | 記憶服務 API | `http://127.0.0.1:8890` |
| mem0 Postgres | `aiyo-new-mem0-postgres` | mem0 專用資料庫 | 僅 Docker network 內使用 |

## 目錄重點

| 路徑 | 說明 |
|------|------|
| [aiyo/](./aiyo) | 主應用程式 |
| [docker-compose.yml](./docker-compose.yml) | 所有服務的 Compose 定義 |
| [all-up.ps1](./all-up.ps1) | 一次重建 shared services + dev + prod-live |
| [dev-up.ps1](./dev-up.ps1) | 啟動 dev stack |
| [prod-live-up.ps1](./prod-live-up.ps1) | 啟動 prod-live stack |
| [frontend-up.ps1](./frontend-up.ps1) | 只重建前端 app containers |
| [scripts/import-compose-dotenv.ps1](./scripts/import-compose-dotenv.ps1) | 將 `aiyo/.env.*` 載入 PowerShell 環境，供 Compose 變數替換使用 |
| [aiyo/.env.dev.example](./aiyo/.env.dev.example) | dev 範例環境變數 |
| [aiyo/.env.prod-live.example](./aiyo/.env.prod-live.example) | prod-live 範例環境變數 |

## 先決條件

部署前請先確認：

1. Windows + PowerShell 可執行 `*.ps1`。
2. 已安裝 Docker Desktop，且 Docker Engine 正常運作。
3. 已安裝 Node.js 20+。
4. 宿主機已安裝並啟動 Ollama。
5. 若要使用 Google 登入、YouTube、Google Maps、網路搜尋，需準備對應 API 金鑰。

建議先確認：

```powershell
docker version
docker compose version
node -v
ollama --version
```

## 第一次部署前要做的事

### 1. 建立環境變數檔

如果檔案還不存在，先複製兩份範例：

```powershell
Copy-Item aiyo/.env.dev.example aiyo/.env.dev
Copy-Item aiyo/.env.prod-live.example aiyo/.env.prod-live
```

如果你直接執行 `dev-up.ps1`、`prod-live-up.ps1` 或 `all-up.ps1`，腳本也會在缺檔時自動從 example 複製。

### 2. 修改至少這些必要欄位

#### 驗證與登入

| 變數 | 說明 |
|------|------|
| `NEXTAUTH_URL` | Dev 預設應為 `http://127.0.0.1:3000`，prod-live 預設應為 `http://127.0.0.1:3001` |
| `NEXTAUTH_SECRET` | NextAuth 用的長隨機字串，dev/prod-live 請分開設定 |
| `GOOGLE_CLIENT_ID` | Google OAuth Client ID，可留空代表不啟用 Google 登入 |
| `GOOGLE_CLIENT_SECRET` | Google OAuth Client Secret |

#### AI gateway / 模型

| 變數 | 說明 |
|------|------|
| `OPENWEBUI_BASE_URL` | Docker 內應維持 `http://open-webui:8080` |
| `OPENWEBUI_API_KEY` | 你在 Open WebUI 內建立的 API key |
| `OPENWEBUI_MODEL` | 主要聊天/規劃模型名稱，例如 `granite4.1:8b` |
| `OPENWEBUI_SECRET_KEY` | Open WebUI 的應用密鑰 |
| `OPENWEBUI_ADMIN_EMAIL` | Open WebUI 初始管理員帳號 |
| `OPENWEBUI_ADMIN_PASSWORD` | Open WebUI 初始管理員密碼 |

#### mem0

| 變數 | 說明 |
|------|------|
| `MEM0_ENABLED` | 是否啟用記憶功能，通常維持 `true` |
| `MEM0_BASE_URL` | Docker 內應維持 `http://aiyo-new-mem0:8890` |
| `MEM0_API_KEY` | AIYO 呼叫 mem0 時使用的 API key，請換成自己的值 |
| `MEM0_COLLECTION_NAME` | 向量資料表集合名，預設 `aiyo_memories` |
| `MEM0_LLM_PROVIDER` | mem0 內部使用的 LLM provider，預設 `ollama` |
| `MEM0_LLM_MODEL` | mem0 內部使用的模型 |
| `MEM0_LLM_BASE_URL` | mem0 要連去的 Ollama 位址，預設 `http://host.docker.internal:11434` |

#### 主資料庫與快取

| 變數 | 說明 |
|------|------|
| `DATABASE_URL` | AIYO 主資料庫連線字串 |
| `POSTGRES_PASSWORD` | `aiyo-new-postgres` 的密碼 |
| `POSTGRES_DB` | AIYO 主資料庫名稱 |
| `REDIS_URL` | Redis 連線字串 |

#### 外部 API

| 變數 | 說明 |
|------|------|
| `YOUTUBE_API_KEY` | YouTube 影片推薦與摘要來源 |
| `GOOGLE_MAPS_API_KEY` | 後端 Google Maps / Places 使用 |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 前端地圖使用 |
| `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID` | Google Maps Map ID |
| `TAVILY_API_KEY` / `SERPER_API_KEY` | 網路搜尋 provider |

### 3. 建議先拉模型

目前 `.env` 範例預設會用到這些模型：

```powershell
ollama pull qwen3.5:9b
ollama pull granite4.1:3b
ollama pull granite4.1:8b
ollama pull mistral-small:24b
```

如果你換模型，請同步修改：

- `OPENWEBUI_MODEL`
- `OLLAMA_MODEL`
- `OLLAMA_TRAVEL_CHAT_MODEL`
- `OLLAMA_TRIP_PLAN_MODEL`
- `OLLAMA_VIDEO_SUMMARY_MODEL`
- `MEM0_LLM_MODEL`

### 4. 啟動 Ollama

請確認宿主機的 Ollama 可回應：

```powershell
curl http://127.0.0.1:11434/api/tags
```

如果這一步失敗，Open WebUI 與 mem0 雖然可能會啟動，但 AI 回答與記憶功能會失效。

## Google OAuth 設定

如果要啟用 Google 登入，Google Cloud Console 至少要配置：

### Authorized JavaScript origins

```text
http://127.0.0.1:3000
http://localhost:3000
http://127.0.0.1:3001
http://localhost:3001
```

### Authorized redirect URIs

```text
http://127.0.0.1:3000/api/auth/callback/google
http://localhost:3000/api/auth/callback/google
http://127.0.0.1:3001/api/auth/callback/google
http://localhost:3001/api/auth/callback/google
```

注意：

1. `NEXTAUTH_URL` 必須和你實際開瀏覽器使用的網址一致。
2. 如果你用 `127.0.0.1:3000` 登入，就不要只配 `localhost:3000`。
3. dev 與 prod-live 是兩個不同入口，因此 `3000` 與 `3001` 都要加。

## Open WebUI 初始設定

第一次跑起來之後，請打開：

- [http://127.0.0.1:8080](http://127.0.0.1:8080)

然後依序做：

1. 用 `.env` 裡的 `OPENWEBUI_ADMIN_EMAIL` / `OPENWEBUI_ADMIN_PASSWORD` 登入。
2. 確認 Open WebUI 能看到宿主機 Ollama 模型。
3. 到 `Settings -> Account` 建立 API key。
4. 把這組 key 填回：
   - `aiyo/.env.dev` 的 `OPENWEBUI_API_KEY`
   - `aiyo/.env.prod-live` 的 `OPENWEBUI_API_KEY`
5. 重新啟動 app containers。

若 Open WebUI 資料卷是全新的，管理員帳號會依 `.env` 自動建立；若你沿用舊 volume，則會保留既有帳號資料。

## 啟動方式

### 只啟動 dev

```powershell
.\dev-up.ps1
```

此腳本會：

1. 確認 `aiyo/.env.dev` 存在。
2. 將 `aiyo/.env.dev` 載入目前 PowerShell session，供 Compose 做 `${VAR}` 替換。
3. 建立或重建以下服務：
   - `aiyo-new-postgres`
   - `aiyo-new-mem0-postgres`
   - `aiyo-new-redis`
   - `aiyo-new-mem0`
   - `open-webui`
   - `aiyo-new-app-dev`

啟動完成後，入口如下：

- App: [http://127.0.0.1:3000](http://127.0.0.1:3000)
- Open WebUI: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Health: [http://127.0.0.1:3000/api/health](http://127.0.0.1:3000/api/health)

### 只啟動 prod-live

```powershell
.\prod-live-up.ps1
```

此腳本會使用 `aiyo/.env.prod-live`，並啟動：

- `aiyo-new-postgres`
- `aiyo-new-mem0-postgres`
- `aiyo-new-redis`
- `aiyo-new-mem0`
- `open-webui`
- `aiyo-new-app-prod-live`

啟動完成後，入口如下：

- App: [http://127.0.0.1:3001](http://127.0.0.1:3001)
- Open WebUI: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Health: [http://127.0.0.1:3001/api/health](http://127.0.0.1:3001/api/health)

### 同時啟動 dev + prod-live

```powershell
.\all-up.ps1
```

此腳本會分兩段執行：

1. 用 `aiyo/.env.dev` 重建 shared services 與 `aiyo-new-app-dev`
2. 再用 `aiyo/.env.prod-live` 重建 `aiyo-new-app-prod-live`

適合以下情況：

- 同時比對 dev 與 prod-live 行為
- 你改了共享基礎設施，例如 Postgres、Redis、mem0、Open WebUI
- 你要驗證兩套 `.env` 都能正常啟動

### 只重建前端 app containers

```powershell
.\frontend-up.ps1
```

這支腳本不會重建 Postgres、Redis、mem0 或 Open WebUI，只會重建：

- `aiyo-new-app-dev`
- `aiyo-new-app-prod-live`

適合單純修改 app 程式碼或 `.env` 中 app 專用參數後快速重啟。

## 等待時間與首次啟動時間

第一次啟動或大改版後，等待較久通常是正常的，主要時間會花在：

1. Docker image build
2. `npm install`
3. `npx prisma generate`
4. `npx prisma migrate deploy`
5. `npm run build`，尤其是 `aiyo-new-app-prod-live`
6. Open WebUI 啟動與初始化
7. mem0 容器啟動、補 migration、健康檢查

經驗上：

- `dev-up.ps1` 通常比 `all-up.ps1` 快
- `prod-live-up.ps1` 會因為 `npm run build` 而明顯較慢
- `all-up.ps1` 最慢，因為要連續處理兩套 app

如果只是改前端邏輯，優先用 `frontend-up.ps1`。

## 如何確認服務真的健康

### Compose 狀態

```powershell
docker compose ps
```

你應該看到至少這些服務為 `healthy` 或 `up`：

- `aiyo-new-app-dev`
- `aiyo-new-app-prod-live`
- `aiyo-new-mem0`
- `aiyo-new-mem0-postgres`
- `aiyo-new-postgres`
- `aiyo-new-redis`
- `open-webui`

### HTTP health check

```powershell
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3001/api/health
curl http://127.0.0.1:8890/docs
```

### 查看 logs

```powershell
docker compose logs -f aiyo-new-app-dev
docker compose logs -f aiyo-new-app-prod-live
docker compose logs -f aiyo-new-mem0
docker compose logs -f open-webui
```

## mem0 驗證方式

如果你要確認 AI 記憶功能真的有接到 mem0，可以做三層驗證：

### 1. 看環境變數

```powershell
docker exec aiyo-new-app-dev node -e "console.log(process.env.MEM0_BASE_URL, process.env.MEM0_ENABLED)"
```

預期會看到類似：

```text
http://aiyo-new-mem0:8890 true
```

### 2. 看 mem0 API 是否可達

```powershell
docker exec aiyo-new-app-dev node -e "fetch('http://aiyo-new-mem0:8890/docs').then(r=>console.log(r.status)).catch(err=>console.error(err))"
```

### 3. 看資料庫內是否有記憶資料

```powershell
docker exec aiyo-new-mem0-postgres psql -U postgres -d mem0_app -c "select count(*) from aiyo_memories;"
```

如果你在聊天中要求 AI 記住偏好，這個數字應該會逐步增加。

## 常用 Docker 指令

### 停止但保留 volumes

```powershell
docker compose down
```

### 重新 build 並啟動單一服務

```powershell
docker compose --env-file ./aiyo/.env.dev up -d --build --force-recreate aiyo-new-app-dev
```

### 查看單一服務狀態

```powershell
docker inspect --format "{{json .State.Health }}" aiyo-new-mem0
```

## App 層測試

請在 [aiyo/](./aiyo) 目錄執行：

```powershell
cd aiyo
npm install
npm test
npm run build
```

規劃相關 E2E：

```powershell
npm run test:e2e:phase7
npm run test:e2e:phase8
```

Live AI 驗證，需先確保：

- Open WebUI 正常
- `OPENWEBUI_API_KEY` 已填入
- 需要的模型可由 Open WebUI 呼叫

```powershell
$env:E2E_LIVE_AI="1"
npm run test:e2e:live-ai:itinerary
```

## 目前 `.env` 內模型相關預設

範例檔目前預設：

- `OPENWEBUI_MODEL=granite4.1:8b`
- `OLLAMA_MODEL=qwen3.5:9b`
- `OLLAMA_TRAVEL_CHAT_MODEL=qwen3.5:9b`
- `OLLAMA_TRIP_PLAN_MODEL=granite4.1:3b`
- `OLLAMA_VIDEO_SUMMARY_MODEL=granite4.1:8b`
- `OLLAMA_VIDEO_SUMMARY_FAST_MODEL=mistral-small:24b`
- `OLLAMA_VIDEO_SUMMARY_FINAL_MODEL=granite4.1:8b`
- `OLLAMA_LOCATION_MODEL=granite4.1:8b`
- `MEM0_LLM_MODEL=qwen3.5:9b`

如果你調整模型，請確認：

1. Ollama 已實際 pull 該模型
2. Open WebUI 可看到該模型
3. `.env.dev` 與 `.env.prod-live` 兩份都有同步更新

## 疑難排解

### 1. `NEXTAUTH_URL is missing`

代表 `aiyo/.env.dev` 或 `aiyo/.env.prod-live` 沒有正確設定 `NEXTAUTH_URL`。

### 2. Google 登入按鈕出現但登入失敗

通常是以下其中一項：

1. `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` 未填
2. Google Console 沒有加對 redirect URI
3. `NEXTAUTH_URL` 與實際瀏覽器網址不一致

### 3. Open WebUI 正常開，但 AIYO 無法回答

請檢查：

1. `OPENWEBUI_API_KEY` 是否已填
2. Open WebUI 是否真的能存取 Ollama
3. `OPENWEBUI_MODEL` 是否存在

### 4. mem0 啟動但記憶不生效

請檢查：

1. `MEM0_ENABLED=true`
2. `MEM0_API_KEY` 是否與 mem0 容器設定一致
3. `MEM0_BASE_URL` 是否為 `http://aiyo-new-mem0:8890`
4. `aiyo-new-mem0` 是否 healthy

### 5. 啟動很慢

優先看：

```powershell
docker compose logs -f aiyo-new-app-prod-live
docker compose logs -f open-webui
docker compose logs -f aiyo-new-mem0
```

通常不是卡死，而是還在：

- build image
- install node modules
- 跑 Prisma migration
- build Next.js production bundle

## 補充文件

- [aiyo/README.md](./aiyo/README.md)
- [docs/README.md](./docs/README.md)
- [docs/architecture.md](./docs/architecture.md)
- [docs/docker-rollback.md](./docs/docker-rollback.md)
- [docs/docker_dev_migration.md](./docs/docker_dev_migration.md)

## 不建議直接做的事

1. 不要只改 `aiyo/.env.dev` 忘記同步 `aiyo/.env.prod-live`
2. 不要把 `localhost` 與 `127.0.0.1` 當成完全等價，Google OAuth 與 NextAuth 會受影響
3. 不要只重建 app container 就期待 Open WebUI 的 API key 自動更新；改完 key 後要重啟 app
4. 不要把 `README` 內舊的「mem0 不在 active stack」當成現況，現在 mem0 已是正式啟用的一部分
