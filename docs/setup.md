# 部署與操作

核對日期：2026-10-04。這份指南描述目前儲存庫的本機啟動方式，不代表已完成公開服務部署。命令以 PowerShell 表示；未特別註明時從儲存庫根目錄執行。

## 環境需求

- Node.js 與 npm：容器使用 Node 22；CI 已對齊 Node 22（先前為 Node 20）。宿主機建議與容器一致，避免以不同版本的執行結果互相比較。
- Docker Engine 與 Compose：Windows 使用 Docker Desktop，啟用 Linux containers。
- 宿主機 Ollama：需事先下載設定中使用的模型，模型是否可用以本機清單為準。
- 首次安裝需網路下載 npm、Python、模型及映像依賴。
- YouTube 搜尋需對應 API key；Google OAuth、Serper／Tavily 依啟用功能設定。地圖主流程不以 Google Maps key 為必要條件。
- 宿主機執行 worker 時，若要使用 yt-dlp 備援，需安裝並讓該程序可從 PATH 找到；容器 Dockerfile 已安裝。

尚未建立經量測的最低 CPU／RAM／GPU 配置。顯示記憶體需求取決於模型大小、量化與同時載入數量；不要把特定開發機的成功啟動當作通用硬體門檻。

## 1. 建立設定

```powershell
git clone https://github.com/AlbertLin821/AIYO_new.git
cd AIYO_new
Copy-Item aiyo/.env.dev.example aiyo/.env.dev
# 只有要使用 prod-live 時才建立第二份。
Copy-Item aiyo/.env.prod-live.example aiyo/.env.prod-live
```

已有設定檔時不要重新複製覆蓋。以下僅說明變數用途，不提供可直接公開使用的密鑰。

| 設定 | 用途與注意事項 |
| --- | --- |
| `NEXTAUTH_SECRET`、`NEXTAUTH_URL` | 自行產生密鑰；URL 必須與實際瀏覽器入口一致 |
| `POSTGRES_PASSWORD`、`DATABASE_URL` | 密碼保持一致；URL 中的特殊字元需編碼 |
| `REDIS_URL` | 網站與 worker 必須指向同一工作佇列 |
| `OPENWEBUI_BASE_URL`、`OPENWEBUI_API_KEY` | gateway 位址與自行建立的 API key |
| `OPENWEBUI_SECRET_KEY`、`OPENWEBUI_ADMIN_PASSWORD` | 替換範例值；既有 volume 不會因修改初始帳密就重設帳號 |
| `OPENWEBUI_PUBLIC_URL` | 預設宿主機入口應為 `http://127.0.0.1:18080` |
| `OPENWEBUI_HOST_PORT` | 選填，預設 18080；變更時同步 public URL |
| `MEM0_ENABLED`、`MEM0_API_KEY`、`MEM0_BASE_URL` | 範例啟用 Mem0；應用程式與容器的 key 須一致 |
| `MEM0_LLM_BASE_URL` | Mem0 容器呼叫宿主機 Ollama，通常為 `http://host.docker.internal:11434` |
| `MEM0_EMBEDDER_MODEL`、`MEM0_EMBEDDING_DIMS` | 須相互匹配，修改既有集合前需規劃資料重建 |
| `GOOGLE_CLIENT_ID`、`GOOGLE_CLIENT_SECRET` | 選填；未設定仍可使用 Email／Password 登入 |
| `YOUTUBE_API_KEY` | 影片搜尋及相關來源功能 |
| `SERPER_API_KEY`、`TAVILY_API_KEY` | 依選用搜尋 provider 設定 |
| `NEXT_PUBLIC_MAP_STYLE_URL` | 瀏覽器可存取的地圖樣式；變更正式建置設定後需重建 |
| `AIYO_JOB_PREFIX` | 選填；網站與 worker 必須一致，隔離環境時使用不同值 |

Compose 的 `--env-file` 控制 YAML 變數插值，服務的 `env_file` 則將設定傳入容器，兩者用途不同。不要將含密鑰的 `docker compose config` 完整輸出貼到公開 issue。

### 模型設定

[server/config.ts](../aiyo/src/server/config.ts) 依任務選擇模型。範例包含 `OLLAMA_MODEL`、`OLLAMA_TRAVEL_CHAT_MODEL`、`OLLAMA_TRIP_PLAN_MODEL`、`OLLAMA_VIDEO_SUMMARY_MODEL`、`OLLAMA_VIDEO_SUMMARY_FAST_MODEL`、`OLLAMA_VIDEO_SUMMARY_FINAL_MODEL`、`OLLAMA_LOCATION_MODEL` 與 `MEM0_LLM_MODEL`。

先執行 `ollama list`，確認設定引用的模型均可取得；缺少時以 `ollama pull <設定中的模型名稱>` 下載。也可將實際使用的角色設定為同一個已安裝模型，減少模型切換，但要重新驗證結構化輸出與速度。2026-09-21 的驗證曾統一使用 `qwen3.5:9b`，不代表各預設模型都已取得相同結果。

`OPENWEBUI_BASE_URL` 非空時啟用 gateway 路徑；未設定時保留直接 Ollama 的能力。主機與容器的位址不同：

| 服務 | 宿主機程序使用 | 同一 Compose 網路內使用 |
| --- | --- | --- |
| PostgreSQL | `127.0.0.1:5432` | `aiyo-new-postgres:5432` |
| Redis | `127.0.0.1:6379` | `aiyo-new-redis:6379` |
| Mem0 | `http://127.0.0.1:8890` | `http://aiyo-new-mem0:8890` |
| Open WebUI | `http://127.0.0.1:18080` | `http://open-webui:8080` |
| Ollama | `http://127.0.0.1:11434` | `http://host.docker.internal:11434` |

## 2. 啟動共用服務

確認 Ollama 已啟動：

```powershell
Invoke-RestMethod http://127.0.0.1:11434/api/tags
```

從儲存庫根目錄載入已填妥的設定並啟動：

```powershell
. ./scripts/import-compose-dotenv.ps1
$null = Import-AiyoComposeDotEnv -Root (Get-Location).Path -Mode dev
docker compose --env-file ./aiyo/.env.dev up -d --build aiyo-new-postgres aiyo-new-mem0-postgres aiyo-new-redis aiyo-new-mem0 open-webui
```

Mem0 映像會從儲存庫中的第三方原始碼建置，並安裝 CPU PyTorch、embedder 及相關依賴，首次建置可能較久。保留 `archive/legacy/20260605-005529/vendor/mem0`，目前 Dockerfile 仍引用它。

開啟 `http://127.0.0.1:18080`，使用自己設定的管理員帳號登入，確認模型可用並建立 API key，填入 `.env.dev` 的 `OPENWEBUI_API_KEY`。之後重新載入設定或重啟讀取該檔的程序。

## 3A. 網站與 worker 在宿主機執行

從儲存庫根目錄進入應用目錄：

```powershell
cd aiyo
npm ci
npm run prisma:generate
node scripts/copy-maplibre-worker.mjs
npx tsx scripts/start-local-stack.ts migrate
npx tsx scripts/start-local-stack.ts app
```

另一個終端在同一 `aiyo/` 目錄執行：

```powershell
npx tsx scripts/start-local-stack.ts worker
```

網站入口為 `http://127.0.0.1:3000`。啟動 helper 會把指定服務的容器 hostname 改為宿主機位址，並將 gateway 的 8080 改為 18080；它不會啟動 Docker 或 Ollama。helper 直接呼叫 Next.js，因此首次使用先執行 MapLibre worker 複製步驟；一般 `npm run dev`／`npm run build` 會透過 lifecycle script 執行該步驟。

檢查 `/api/health`、登入、送出聊天與影片工作。worker 終端應顯示 ready；只開網站會使背景工作停留在等待狀態。

## 3B. 網站與 worker 都在 Docker 執行

完成共用服務與 gateway key 設定後，在儲存庫根目錄執行：

```powershell
docker compose --env-file ./aiyo/.env.dev up -d --build aiyo-new-app-dev
# 先確認 app 已完成 Prisma migration，再啟動 worker。
docker compose --env-file ./aiyo/.env.dev up -d --build aiyo-new-worker
docker compose --env-file ./aiyo/.env.dev ps
```

目前 `dev-up.ps1`、`prod-live-up.ps1`、`all-up.ps1` 的服務清單不包含 worker；使用這些腳本時仍需明確啟動 `aiyo-new-worker`。部分腳本的輸出文字仍列出舊的 Open WebUI 8080，請以 Compose 的實際 port mapping 為準。

不要同時以宿主機和容器啟動兩份使用同一埠的網站。多個 worker 雖可消費同一佇列，但會改變模型負載，功能驗證時應清楚記錄。

## 正式建置的本機驗證

宿主機方式，在 `aiyo/` 中停止 dev server 後：

```powershell
$env:AIYO_ENV_FILE = ".env.dev"
npm run build
npx tsx scripts/start-local-stack.ts production
```

worker 仍需另行執行。上述是在 3000 埠測試 production bundle，不是公開部署。

容器 `aiyo-new-app-prod-live` 使用 `.env.prod-live` 並映射到 3001，可由 `prod-live-up.ps1` 啟動。其 worker 定義仍使用 `.env.dev`，因此兩份設定的資料庫、Redis、queue prefix 必須相容；需要真正環境隔離時，必須增加獨立 worker 設定，不能只改網站埠號。

## 登入與公開部署

Google OAuth 的 redirect URI 必須是實際入口加上 `/api/auth/callback/google`，例如 `http://127.0.0.1:3000/api/auth/callback/google`。`localhost` 與 `127.0.0.1` 不可混用。正式網域須另外配置 HTTPS、OAuth origin、callback 與 `NEXTAUTH_URL`。

現有 Compose 將對外連接埠綁定 loopback，且 Mem0 資料庫含本機用途的固定帳密。公開部署前應配置反向代理、密鑰管理、私有服務網路、備份恢復、存取限制與獨立環境；不能直接把綁定位址改成所有介面就視為完成部署。詳見 [安全政策](../SECURITY.md)。

## 健康檢查與故障定位

```powershell
docker compose --env-file ./aiyo/.env.dev ps
Invoke-RestMethod http://127.0.0.1:3000/api/health
Invoke-WebRequest http://127.0.0.1:18080/health
docker compose logs --tail 100 aiyo-new-worker
docker compose logs --tail 100 aiyo-new-mem0
```

| 現象 | 優先檢查 |
| --- | --- |
| 網站可開但影片一直排隊 | worker 是否運作；網站與 worker 的 Redis、prefix 是否一致 |
| 影片提交回 503 | Redis 可達性與 queue 連線；不要把拒絕排隊誤認為模型錯誤 |
| gateway 可開但 AI 失敗 | API key、模型可用性、gateway 至宿主機 Ollama 的連線 |
| Mem0 healthy 卻沒有記憶 | 實測新增／檢索，確認模型與 embedder；health 不代表擷取成功 |
| 宿主機無法解析服務 hostname | 是否使用 start-local-stack helper，或自行設定了正確宿主機 URL |
| 登入後 API 仍未授權 | 網址、Cookie、NEXTAUTH_SECRET 與測試程序是否一致 |
| 修改設定未生效 | 重啟讀取設定的 app／worker；公開前端變數可能需重新 build |
| 地點或路線缺少 | 查供應者結果與資料覆蓋；不能補造座標掩蓋缺值 |

應用環境檔由 [projectEnv.ts](../aiyo/src/lib/projectEnv.ts) 選擇：明示 `AIYO_ENV_FILE` 優先，否則依 mode／NODE_ENV 選 dev 或 prod-live；找不到再查 `.env.local`、`.env`。讀取第一個存在的檔案，並預設不覆寫已存在的程序變數；它不是將所有檔案合併。

停止容器可使用 `docker compose down`，此命令不刪除 named volumes。不要以 `down -v` 作為一般重啟方式。資料備份至少涵蓋主資料庫、Mem0 資料庫與 Open WebUI 設定；Redis AOF 有助於工作恢復，但不取代獨立備份。
