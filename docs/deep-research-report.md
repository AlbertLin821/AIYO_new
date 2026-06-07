# AIYO_new omen 分支 Docker 改造研究報告

## 執行摘要

本報告的結論很明確：對 `AIYO_new` 的 Docker 佈署，最穩定、最容易維護、也最符合你目前需求的做法，是把堆疊收斂為 **六個主要服務**：`aiyo-new-app-dev`、`aiyo-new-app-prod-live`、`aiyo-new-postgres-dev`、`aiyo-new-postgres-prod`、`aiyo-new-redis`、`open-webui`，並讓 **Ollama 繼續跑在宿主機**，由 `open-webui` 透過 `host.docker.internal:11434` 連線。這樣做能把 AI Gateway、應用程式、資料層清楚分離，並且避免再維護 `searxng`、`mem0`、`pgadmin` 這些目前不屬於最小可用路徑的額外容器。Open WebUI 官方文件明確支援 Docker 佈署、以 `host.docker.internal` 連接宿主機上的 Ollama、以 Bearer Token 提供 `/api/chat/completions` 與 `/api/models`，並提供 `/health` 做健康檢查；Docker Compose 官方也支援 `depends_on` 搭配 `service_healthy`、`env_file`、`extra_hosts`、單一 bridge network 服務發現等能力。citeturn18search8turn7view0turn7view1turn11view0turn1view4turn12search12turn14search3

本設計同時建議把 **dev 與 prod-live 的 PostgreSQL 拆開**，避免開發遷移、測試資料或壓力測試污染展示環境；Redis 則保留給 AIYO 自己的 queue、cache、job state，而 **不在這個階段把 Open WebUI 也升級成多副本**。Open WebUI 官方說明很清楚：**單一實例、`UVICORN_WORKERS=1` 的情況下，Redis 不是基本功能必需品**；但一旦進入多 worker、多副本，就必須使用外部 PostgreSQL、Redis 與外部 Vector DB，因為預設的本機 SQLite 與 SQLite-backed ChromaDB 不適合多副本併發。citeturn7view5turn7view4turn8view8turn7view2

就安全面來看，建議所有對宿主機公開的 port 一律先綁到 `127.0.0.1`，而不是預設的 `0.0.0.0`。Docker 官方文件特別提醒，若 `ports` 沒有指定 host IP，Compose 會綁到所有介面，這可能讓容器埠直接暴露到外網。與此同時，Open WebUI 應強制保留 `WEBUI_AUTH=true`、設定固定且足夠長的 `WEBUI_SECRET_KEY`，並開啟 `ENABLE_API_KEYS=true` 供 AIYO backend 程式化呼叫；官方也建議 API key 以專用帳號建立、不要提交進版本控制，並在必要時使用 endpoint restrictions。citeturn17search5turn8view2turn8view4turn9view0turn9view1

本報告以下內容假設：**倉庫結構尚未明示**，因此用開放式路徑模式撰寫，例如 `docker-compose.yml` 位於 repo root，應用程式位於 `./aiyo`；**Ollama 跑在宿主機的 `11434`**；**Open WebUI 對 host 開在 `8080`**；AIYO dev/live 分別對 host 開在 `3000` 與 `3001`。此外，也假設目前 omen 分支可能仍保有舊堆疊的 `searxng`、`mem0`、單一 `postgres` 或 `pgadmin` 等殘留設定，因此報告同時提供「語意型 patch」與「完整更新後 compose 範例」，讓你可以對照現況套用。citeturn7view0turn10view0turn8view3turn7view6

下列官方來源是本次設計的主要依據，均為一手文件或官方映像／官方維護頁面：

| 主要來源 | 用途 |
| --- | --- |
| Open WebUI Quick Start citeturn10view0turn10view2 | Docker 安裝、volume、版本固定、Compose 基本型態 |
| Open WebUI Connecting to Ollama citeturn7view0turn8view0 | 宿主機 Ollama 連線方式與 `OLLAMA_BASE_URL` |
| Open WebUI API Endpoints 與 API Keys citeturn7view1turn9view0turn9view1 | Backend 呼叫 `/api/chat/completions`、Bearer Token 驗證 |
| Open WebUI Monitoring 與 Scaling citeturn11view0turn7view2turn7view4 | `/health`、`/api/models`、多副本升級門檻 |
| Ollama API 與 FAQ citeturn7view6turn7view7turn7view8 | 宿主機 11434、預設 bind 位址、OpenAI 相容端點 |
| Docker Compose 官方文件 citeturn1view3turn1view4turn14search3turn17search0turn7view9 | healthcheck、depends_on、network、extra_hosts、config 驗證 |
| pgvector 官方映像與專案文件 citeturn13search0turn13search2turn1view6 | 使用 `pgvector/pgvector` 作為 PostgreSQL 映像 |

## 假設與目標架構

此次改造的核心原則不是「把 AIYO 變成 Open WebUI 專案」，而是把 **Open WebUI 變成 AIYO 的 AI Gateway**。Open WebUI 官方定位本來就支援 Docker、自架、支援 Ollama 與 OpenAI-compatible provider，也提供完整 REST API；Docker Compose 也會為同一個應用建立預設 bridge network，讓容器彼此能直接透過 service name 存取。因此，AIYO backend 只要打 `http://open-webui:8080`，不需要把 Open WebUI 的前端介面嵌進 AIYO。citeturn18search8turn1view2turn14search3turn7view1

```mermaid
flowchart LR
    U[使用者瀏覽器] -->|127.0.0.1:3000| DEV[aiyo-new-app-dev]
    U -->|127.0.0.1:3001| LIVE[aiyo-new-app-prod-live]

    DEV -->|SQL| PGDEV[aiyo-new-postgres-dev]
    LIVE -->|SQL| PGPROD[aiyo-new-postgres-prod]

    DEV -->|Redis| REDIS[aiyo-new-redis]
    LIVE -->|Redis| REDIS

    DEV -->|HTTP| OWU[open-webui:8080]
    LIVE -->|HTTP| OWU

    OWU -->|HTTP| OLLAMA[宿主機 Ollama :11434]
```

舊堆疊與新堆疊的比較，因為沒有看到 omen 分支原始檔，只能以「常見現況」推定；你應把左欄視為**待盤點的現況候選**，而右欄視為**目標狀態**：

| 類別 | 假設中的舊服務 | 典型舊 host port | 新服務 | 新 host 綁定 |
| --- | --- | --- | --- | --- |
| 開發 App | `app-dev` 或 `aiyo-new-app-dev` | `3000` | `aiyo-new-app-dev` | `127.0.0.1:3000:3000` |
| 展示 App | `app` 或 `aiyo-new-app` | `3001` 或與 dev 衝突 | `aiyo-new-app-prod-live` | `127.0.0.1:3001:3000` |
| PostgreSQL | 單一 `postgres` | `5432` | `aiyo-new-postgres-dev` | `127.0.0.1:5432:5432` |
| PostgreSQL | 無獨立 prod DB | 無 | `aiyo-new-postgres-prod` | `127.0.0.1:5433:5432` |
| Redis | `redis` | `6379` | `aiyo-new-redis` | `127.0.0.1:6379:6379` |
| 搜尋 | `searxng` | 視現況而定 | 移除 | 無 |
| 記憶 | `mem0-memory`、`mem0-memory-postgres` | 視現況而定 | 先移除／封存 | 無 |
| 管理工具 | `pgadmin` | `5050` 或其他 | 先移除／封存 | 無 |
| AI Gateway | 無 | 無 | `open-webui` | `127.0.0.1:8080:8080` |

這個架構的關鍵優點有三個。第一，**Open WebUI 直接吃宿主機 Ollama**：官方明確建議 Docker 使用者若 Ollama 跑在 host，連線位址使用 `http://host.docker.internal:11434`；若有多個 Ollama instance，Open WebUI 還能做基本 random load balancing。第二，AIYO backend 叫用 Open WebUI 時，可以統一使用 `POST /api/chat/completions` 與 `GET /api/models`；這些 API 同時支援 Bearer Token。第三，單機單副本時，Open WebUI 可以只靠 `/app/backend/data` volume；真正需要 PostgreSQL、Redis、Vector DB，是在多副本或高可用情境。citeturn7view0turn7view1turn9view0turn8view8turn7view4

需要特別注意的是：**Ollama 預設綁定在 `127.0.0.1:11434`**。在 Docker Desktop 上，`host.docker.internal` 通常可直接運作；在 Linux Docker Engine，若容器無法透過 `host.docker.internal` 連到 host 上的 Ollama，Open WebUI 官方 troubleshooting 文件建議改用 `--network=host` 或宿主機實際 IP，Docker 官方文件也說明可用 `extra_hosts: "host.docker.internal:host-gateway"` 產生動態映射。如果你最後必須調整 Ollama bind address，也要知道 Ollama 的官方建議是透過 `OLLAMA_HOST` 修改，且這代表你在安全邊界上做了新的開口。citeturn7view7turn17search0turn17search2turn2search3turn14search5

## 遷移計畫與 Codex 提示詞

這份遷移應該採取 **先備份、再切換、最後清理** 的順序，而不是一開始就把所有檔案刪乾淨。Docker Compose 官方建議用 `docker compose config` 先解析最終模型；`depends_on` 搭配 `service_healthy` 可避免 app 在 Postgres/Redis 尚未 ready 時就啟動；Open WebUI 則應以 `/health`、`/api/models`、實際 chat completion 三層檢查驗證。citeturn7view9turn1view4turn11view0

```mermaid
timeline
    title AIYO_new omen Docker migration
    備份與盤點 : 備份 compose env scripts DB dump
                : 列出 searxng mem0 pgadmin 參照點
    基礎配置改造 : 拆分 dev/prod PostgreSQL
                  : 新增 open-webui
                  : 將 ports 綁定 127.0.0.1
    應用層切換 : backend 改打 Open WebUI API
               : env 改用 .env.dev / .env.prod-live
    啟動驗證 : docker compose config
             : docker compose up -d --build
             : /health /api/models /api/chat/completions
    清理封存 : 封存 searxng mem0 pgadmin 舊檔
             : 移除未使用程式碼與 env
    穩定化 : commit tag rollback 點
           : 更新 README / runbook
```

以下每一步都附上**目標敘述**與一段可直接貼給 GitHub Copilot / ChatGPT / Codex 類工具的**詳細提示詞**。因 repo 結構未明，提示詞都使用搜尋式、開放式路徑。

1. **目標：盤點並備份 Compose、env、searxng、mem0、pgadmin 與舊 Docker 腳本，先保留可回退材料。**  
   **Codex prompt**
   ```text
   You are editing a repository with unspecified structure. Search from repo root for:
   - docker-compose.yml, compose.yml, docker-compose.*.yml
   - .env files under repo root and ./aiyo
   - folders/files containing searx, searxng, mem0, pgadmin, redis, postgres, open-webui
   Create a migration inventory markdown file at docs/docker-migration-inventory.md that lists:
   1) every matched file path
   2) whether it is active, legacy, or unknown
   3) whether it should be kept, archived, or deleted
   Also create a backup shell script at scripts/backup-docker-migration.sh that:
   - makes a timestamped backup folder under backup/
   - copies matched files while preserving relative paths
   - saves git status and git diff --binary
   - attempts a pg_dumpall if an old postgres container is running
   Do not delete anything yet. Output only the new/changed files.
   ```

2. **目標：把 compose 收斂成六個服務，刪除 active stack 裡的 searxng、mem0、pgadmin。**  
   **Codex prompt**
   ```text
   Refactor the active docker-compose file at repo root into a single compose spec that keeps only:
   - aiyo-new-app-dev
   - aiyo-new-app-prod-live
   - aiyo-new-postgres-dev
   - aiyo-new-postgres-prod
   - aiyo-new-redis
   - open-webui
   Requirements:
   - Ollama stays on host, not in compose
   - open-webui uses ghcr.io/open-webui/open-webui pinned to a stable tag
   - open-webui must connect to Ollama with OLLAMA_BASE_URL=http://host.docker.internal:11434
   - add extra_hosts host.docker.internal:host-gateway for open-webui
   - dev app exposes 127.0.0.1:3000:3000
   - prod-live app exposes 127.0.0.1:3001:3000
   - postgres dev exposes 127.0.0.1:5432:5432
   - postgres prod exposes 127.0.0.1:5433:5432
   - redis exposes 127.0.0.1:6379:6379
   - open-webui exposes 127.0.0.1:8080:8080
   - postgres and redis need healthchecks
   - app services depend on postgres+redis healthy and open-webui started
   - use a single backend network
   - do not leave searxng, mem0, or pgadmin in the active compose
   Preserve the existing app build context / Dockerfile / working command if already correct; otherwise leave a clearly marked generic fallback command.
   Return a unified diff patch.
   ```

3. **目標：建立 `./aiyo/.env.dev` 與 `./aiyo/.env.prod-live` 模板，切掉 searxng 與 mem0。**  
   **Codex prompt**
   ```text
   Create two environment templates:
   - ./aiyo/.env.dev
   - ./aiyo/.env.prod-live
   Requirements:
   - include NODE_ENV, PORT, HOSTNAME, NEXTAUTH_URL, NEXTAUTH_SECRET
   - include DATABASE_URL pointing to the correct compose service name
   - include REDIS_URL
   - include OPENWEBUI_BASE_URL, OPENWEBUI_API_KEY, OPENWEBUI_MODEL
   - set MEM0_ENABLED=false
   - remove old SEARXNG_URL / SEARXNG_ENABLED / MEM0 DSN style variables from active templates
   - leave commented placeholders for optional legacy OLLAMA_BASE_URL only during transition
   - add short comments for any placeholder secret
   If an old .env.example exists, update it or replace it with dev/prod example variants.
   Output exact file contents.
   ```

4. **目標：把 backend 的 AI client 改成 Open WebUI API，而不是直接打 searxng 或散落的舊 provider。**  
   **Codex prompt**
   ```text
   Search the backend for:
   - searx
   - searxng
   - Tavily
   - Serper
   - direct Ollama HTTP calls
   - /api/generate, /api/chat, /v1/chat/completions
   Introduce a single OpenWebUI client module that reads:
   - OPENWEBUI_BASE_URL
   - OPENWEBUI_API_KEY
   - OPENWEBUI_MODEL
   Make the primary chat path call:
   POST /api/chat/completions
   with Authorization: Bearer <key>
   Preserve request timeout handling and structured error propagation.
   Return:
   1) the new client file
   2) the call-site patch
   3) any removed dead code references
   4) notes if a remaining search-specific path still requires manual review
   ```

5. **目標：移除 searxng/mem0 相關未使用檔案，但先移進 archive，保留 git 歷史。**  
   **Codex prompt**
   ```text
   Search the repo for files and directories related to:
   - searx
   - searxng
   - mem0
   - pgadmin
   Move legacy assets into archive/legacy/<timestamp>/ preserving relative subpaths.
   Update references in:
   - README
   - docker docs
   - scripts
   - CI files
   - env examples
   Do not delete archived files yet.
   Produce:
   - a shell script scripts/archive-legacy-docker-assets.sh
   - the patch for moved references
   - a short markdown note docs/docker-legacy-assets.md listing what was archived and why
   ```

6. **目標：建立可重複執行的驗證腳本與 smoke test。**  
   **Codex prompt**
   ```text
   Create scripts/verify-docker-stack.sh that:
   - runs docker compose config
   - checks compose service status
   - curls host Ollama /api/tags
   - curls Open WebUI /health
   - if OPENWEBUI_API_KEY is present, calls /api/models
   - if OPENWEBUI_MODEL is present, sends a simple /api/chat/completions health prompt
   - prints clear pass/fail messages
   Keep it POSIX shell compatible if possible.
   Also add a docs section with the exact commands to run manually.
   ```

7. **目標：建立可回退的 release 點與 rollback 文件。**  
   **Codex prompt**
   ```text
   Create docs/docker-rollback.md for the new stack.
   It must include:
   - which files to restore
   - which backup artifacts to use
   - how to stop the new stack without deleting volumes
   - how to restore the previous compose file and env files
   - how to recreate the prior containers
   - how to restore postgres from pg_dumpall
   - how to remove newly created split postgres volumes if rollback is full
   Keep commands explicit and idempotent where possible.
   ```
   
## Compose 與環境設定成品

在 Compose 實作上，建議使用**單一 repo root `docker-compose.yml`**，不必再拆 profile 作為必要條件；因你現在的目標就是固定六個服務。Compose 官方文件指出 `env_file` 路徑相對於 Compose 檔所在資料夾解析，`environment` 若與 `env_file` 重複，則以前者為準；同時，Compose 新規格不再要求頂層 `version`。Open WebUI 官方則建議 Docker 使用固定 version tag，不要在 production 使用浮動 `:main`。citeturn12search12turn12search0turn1view5turn10view0

### 假設型 unified diff patch

> 這個 patch 假設你的現況接近以下命名：`app-dev`、`app`、`postgres`、`redis`、`searxng`、`mem0-memory`、`mem0-memory-postgres`、`pgadmin`。若 omen 分支實際命名不同，請套用**語意**，不是逐行機械套用。

```diff
--- a/docker-compose.yml
+++ b/docker-compose.yml
@@
-services:
-  app-dev:
+services:
+  aiyo-new-app-dev:
     container_name: aiyo-new-app-dev
     build:
       context: ./aiyo
       dockerfile: Dockerfile
     env_file:
-      - ./aiyo/.env
+      - ./aiyo/.env.dev
     ports:
-      - "3000:3000"
+      - "127.0.0.1:3000:3000"
     depends_on:
-      postgres:
+      aiyo-new-postgres-dev:
         condition: service_healthy
-      redis:
+      aiyo-new-redis:
         condition: service_healthy
+      open-webui:
+        condition: service_started
     networks:
       - backend

-  app:
-    container_name: aiyo-new-app
+  aiyo-new-app-prod-live:
+    container_name: aiyo-new-app-prod-live
     build:
       context: ./aiyo
       dockerfile: Dockerfile
     env_file:
-      - ./aiyo/.env
+      - ./aiyo/.env.prod-live
     ports:
-      - "3001:3000"
+      - "127.0.0.1:3001:3000"
     depends_on:
-      postgres:
+      aiyo-new-postgres-prod:
         condition: service_healthy
-      redis:
+      aiyo-new-redis:
         condition: service_healthy
+      open-webui:
+        condition: service_started
     networks:
       - backend

-  postgres:
-    image: postgres:16
-    container_name: aiyo-new-postgres
+  aiyo-new-postgres-dev:
+    image: pgvector/pgvector:pg16
+    container_name: aiyo-new-postgres-dev
     environment:
       POSTGRES_USER: aiyo
-      POSTGRES_PASSWORD: aiyo_password
-      POSTGRES_DB: aiyo_new_db
+      POSTGRES_PASSWORD: aiyo_password_change_me
+      POSTGRES_DB: aiyo_new_dev_db
     ports:
-      - "5432:5432"
+      - "127.0.0.1:5432:5432"
     volumes:
-      - aiyo_new_postgres_data:/var/lib/postgresql/data
+      - aiyo_new_postgres_dev_data:/var/lib/postgresql/data
     healthcheck:
-      test: ["CMD-SHELL", "pg_isready -U aiyo -d aiyo_new_db"]
+      test: ["CMD-SHELL", "pg_isready -U aiyo -d aiyo_new_dev_db"]
       interval: 5s
       timeout: 5s
       retries: 5
     networks:
       - backend

-  redis:
+  aiyo-new-postgres-prod:
+    image: pgvector/pgvector:pg16
+    container_name: aiyo-new-postgres-prod
+    environment:
+      POSTGRES_USER: aiyo
+      POSTGRES_PASSWORD: aiyo_password_change_me
+      POSTGRES_DB: aiyo_new_prod_db
+    ports:
+      - "127.0.0.1:5433:5432"
+    volumes:
+      - aiyo_new_postgres_prod_data:/var/lib/postgresql/data
+    healthcheck:
+      test: ["CMD-SHELL", "pg_isready -U aiyo -d aiyo_new_prod_db"]
+      interval: 5s
+      timeout: 5s
+      retries: 5
+    networks:
+      - backend
+
+  aiyo-new-redis:
     image: redis:7-alpine
     container_name: aiyo-new-redis
     ports:
-      - "6379:6379"
+      - "127.0.0.1:6379:6379"
     volumes:
       - aiyo_new_redis_data:/data
     healthcheck:
       test: ["CMD", "redis-cli", "ping"]
       interval: 5s
       timeout: 3s
       retries: 5
     restart: unless-stopped
     networks:
       - backend

-  searxng:
-    ...
-
-  pgadmin:
-    ...
-
-  mem0-memory:
-    ...
-
-  mem0-memory-postgres:
-    ...
+  open-webui:
+    image: ghcr.io/open-webui/open-webui:v0.9.6
+    container_name: open-webui
+    environment:
+      ENV: "prod"
+      PORT: "8080"
+      WEBUI_AUTH: "true"
+      ENABLE_API_KEYS: "true"
+      ENABLE_PERSISTENT_CONFIG: "false"
+      WEBUI_SECRET_KEY: "replace-with-a-long-random-secret"
+      OLLAMA_BASE_URL: "http://host.docker.internal:11434"
+    extra_hosts:
+      - "host.docker.internal:host-gateway"
+    ports:
+      - "127.0.0.1:8080:8080"
+    volumes:
+      - open_webui_data:/app/backend/data
+    restart: unless-stopped
+    networks:
+      - backend

 networks:
   backend:
     driver: bridge

 volumes:
-  aiyo_new_postgres_data:
+  aiyo_new_postgres_dev_data:
+  aiyo_new_postgres_prod_data:
   aiyo_new_redis_data:
+  open_webui_data:
```

### 完整更新後 compose 範例

`pgvector/pgvector` 是官方映像；Open WebUI 也官方建議使用 Docker 與 persistent volume，而如果要讓它連宿主機 Ollama，則把 `OLLAMA_BASE_URL` 指到 `host.docker.internal:11434`。`WEBUI_SECRET_KEY` 建議固定設定，因為官方說明如果容器重建卻沒有持久化的 secret key，會讓 session 登出。citeturn13search0turn13search2turn10view0turn7view0turn8view4

```yaml
services:
  aiyo-new-postgres-dev:
    image: pgvector/pgvector:pg16
    container_name: aiyo-new-postgres-dev
    environment:
      POSTGRES_USER: aiyo
      POSTGRES_PASSWORD: aiyo_password_change_me
      POSTGRES_DB: aiyo_new_dev_db
    ports:
      - "127.0.0.1:5432:5432" # 若不需 host 直連，可移除
    volumes:
      - aiyo_new_postgres_dev_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiyo -d aiyo_new_dev_db"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - backend

  aiyo-new-postgres-prod:
    image: pgvector/pgvector:pg16
    container_name: aiyo-new-postgres-prod
    environment:
      POSTGRES_USER: aiyo
      POSTGRES_PASSWORD: aiyo_password_change_me
      POSTGRES_DB: aiyo_new_prod_db
    ports:
      - "127.0.0.1:5433:5432" # 若不需 host 直連，可移除
    volumes:
      - aiyo_new_postgres_prod_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U aiyo -d aiyo_new_prod_db"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped
    networks:
      - backend

  aiyo-new-redis:
    image: redis:7-alpine
    container_name: aiyo-new-redis
    ports:
      - "127.0.0.1:6379:6379" # 若不需 host 直連，可移除
    volumes:
      - aiyo_new_redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped
    networks:
      - backend

  open-webui:
    image: ghcr.io/open-webui/open-webui:v0.9.6
    container_name: open-webui
    environment:
      ENV: "prod"
      PORT: "8080"
      WEBUI_AUTH: "true"
      ENABLE_API_KEYS: "true"
      ENABLE_PERSISTENT_CONFIG: "false"
      WEBUI_SECRET_KEY: "replace-with-a-long-random-secret"
      OLLAMA_BASE_URL: "http://host.docker.internal:11434"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    ports:
      - "127.0.0.1:8080:8080"
    volumes:
      - open_webui_data:/app/backend/data
    restart: unless-stopped
    networks:
      - backend

  aiyo-new-app-dev:
    container_name: aiyo-new-app-dev
    build:
      context: ./aiyo
      dockerfile: Dockerfile
    env_file:
      - ./aiyo/.env.dev
    ports:
      - "127.0.0.1:3000:3000"
    volumes:
      - ./aiyo:/app
      - aiyo_new_node_modules:/app/node_modules
    depends_on:
      aiyo-new-postgres-dev:
        condition: service_healthy
      aiyo-new-redis:
        condition: service_healthy
      open-webui:
        condition: service_started
    stdin_open: true
    tty: true
    # 若 omen 分支已有正確 dev command，請保留原本命令
    command: sh -c "npm install && npm run dev"
    networks:
      - backend

  aiyo-new-app-prod-live:
    container_name: aiyo-new-app-prod-live
    build:
      context: ./aiyo
      dockerfile: Dockerfile
    env_file:
      - ./aiyo/.env.prod-live
    ports:
      - "127.0.0.1:3001:3000"
    depends_on:
      aiyo-new-postgres-prod:
        condition: service_healthy
      aiyo-new-redis:
        condition: service_healthy
      open-webui:
        condition: service_started
    restart: unless-stopped
    # 若 omen 分支已有正確 prod-start command，請保留原本命令
    command: sh -c "npm install && npm run build && npm run start"
    networks:
      - backend

networks:
  backend:
    driver: bridge

volumes:
  aiyo_new_postgres_dev_data:
  aiyo_new_postgres_prod_data:
  aiyo_new_redis_data:
  open_webui_data:
  aiyo_new_node_modules:
```

### `./aiyo/.env.dev` 模板

Open WebUI 的 API key 需要先在 UI 啟用、再由使用者建立。官方文件指出 API key 預設功能是關閉的，且 key 只會在建立時顯示一次；呼叫 API 時要放在 `Authorization: Bearer` header。citeturn9view0turn9view1

```dotenv
# ./aiyo/.env.dev
NODE_ENV=development
PORT=3000
HOSTNAME=0.0.0.0

NEXTAUTH_URL=http://127.0.0.1:3000
NEXTAUTH_SECRET=replace-with-dev-nextauth-secret

DATABASE_URL=postgresql://aiyo:aiyo_password_change_me@aiyo-new-postgres-dev:5432/aiyo_new_dev_db?schema=public
REDIS_URL=redis://aiyo-new-redis:6379/0

OPENWEBUI_BASE_URL=http://open-webui:8080
OPENWEBUI_API_KEY=replace-with-dev-openwebui-api-key
OPENWEBUI_MODEL=granite4.1:8b

# Optional legacy fallback only during transition; remove after full cutover
# OLLAMA_BASE_URL=http://host.docker.internal:11434

MEM0_ENABLED=false
SEARXNG_ENABLED=false

# Keep only if your app actually uses them
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=
NEXT_PUBLIC_ENABLE_MOCK_MAPS=false
```

### `./aiyo/.env.prod-live` 模板

```dotenv
# ./aiyo/.env.prod-live
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

NEXTAUTH_URL=http://127.0.0.1:3001
NEXTAUTH_SECRET=replace-with-prod-live-nextauth-secret

DATABASE_URL=postgresql://aiyo:aiyo_password_change_me@aiyo-new-postgres-prod:5432/aiyo_new_prod_db?schema=public
REDIS_URL=redis://aiyo-new-redis:6379/0

OPENWEBUI_BASE_URL=http://open-webui:8080
OPENWEBUI_API_KEY=replace-with-prod-live-openwebui-api-key
OPENWEBUI_MODEL=granite4.1:8b

# Optional legacy fallback only during transition; remove after full cutover
# OLLAMA_BASE_URL=http://host.docker.internal:11434

MEM0_ENABLED=false
SEARXNG_ENABLED=false

# Keep only if your app actually uses them
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID=
NEXT_PUBLIC_ENABLE_MOCK_MAPS=false
```

### Backend 呼叫 Open WebUI 的範例

Open WebUI 官方 API 文件明確列出 `POST /api/chat/completions` 與 `GET /api/models`，而 API keys 文件明確要求 `Authorization: Bearer`。因此 AIYO backend 最簡單的做法，就是集中出一個 client。citeturn7view1turn9view0

```ts
// ./aiyo/src/lib/openwebui-client.ts
type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export async function chatViaOpenWebUI(messages: ChatMessage[]) {
  const baseUrl = process.env.OPENWEBUI_BASE_URL;
  const apiKey = process.env.OPENWEBUI_API_KEY;
  const model = process.env.OPENWEBUI_MODEL ?? "granite4.1:8b";

  if (!baseUrl) throw new Error("OPENWEBUI_BASE_URL is missing");
  if (!apiKey) throw new Error("OPENWEBUI_API_KEY is missing");

  const res = await fetch(`${baseUrl}/api/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Open WebUI error ${res.status}: ${text}`);
  }

  return res.json();
}
```

## 檔案操作、測試與回復

因為這次改動同時碰到 Compose、環境變數與容器資料，最安全的順序是：**先備份文字檔，再備份 DB，再改 compose，再啟動新堆疊，再清理 legacy 檔案**。Docker Compose 官方文件說明 `docker compose up -d` 會建立或重建有變更的服務，`docker compose down` 預設只會停掉容器與 network，不會刪除 named volumes；`docker compose logs`、`docker compose ps`、`docker compose config` 則是最基本的驗證工具。Open WebUI 官方則提供 `/health`、`/api/models` 與實際 chat completion 的三層檢查。citeturn7view11turn7view12turn7view13turn7view14turn7view9turn11view0

### 安全備份命令

```bash
# 在 repo root 執行
export TS="$(date +%Y%m%d-%H%M%S)"
export BK="backup/${TS}"
mkdir -p "${BK}"

git status --short > "${BK}/git-status.before.txt"
git diff --binary > "${BK}/working-tree.before.patch" || true

# 盤點可能的 legacy 檔案
find . -maxdepth 4 \
  \( -iname '*searx*' -o -iname '*mem0*' -o -iname '*pgadmin*' -o -iname 'docker-compose*.yml' -o -iname '.env*' \) \
  -print | sort > "${BK}/inventory.txt"

# 備份 compose 與 env 類檔案
for p in docker-compose.yml compose.yml docker-compose.*.yml aiyo/.env* .env*; do
  if [ -e "$p" ]; then
    mkdir -p "${BK}/$(dirname "$p")"
    cp -a "$p" "${BK}/$p"
  fi
done

# 若舊 postgres 容器已在跑，先做 logical dump
OLD_DB_CONTAINER="${OLD_DB_CONTAINER:-aiyo-new-postgres}"
docker ps --format '{{.Names}}' | grep -qx "${OLD_DB_CONTAINER}" && \
  docker exec -t "${OLD_DB_CONTAINER}" pg_dumpall -U aiyo > "${BK}/old-postgres-all.sql" || true
```

### 建議移動、封存、刪除的檔案類型

因 repo 未明，下面採「路徑模式」而非硬編碼。建議先 **archive 一個版本週期**，確認新架構穩定後再刪除。

| 類型 | 建議動作 | 路徑模式範例 |
| --- | --- | --- |
| searxng compose | 移到 `archive/legacy/<ts>/` | `docker-compose.searxng*.yml` |
| searxng 設定檔 | 移到 `archive/legacy/<ts>/` | `searxng/`, `docker/searxng/`, `ops/searxng/` |
| searxng env | 移到 `archive/legacy/<ts>/` | `.env.searxng*`, `*searx*.env*` |
| searxng 腳本 | 移到 `archive/legacy/<ts>/` | `scripts/*searx*` |
| mem0 compose | 若不用，移到 `archive/legacy/<ts>/` | `docker-compose.mem0*.yml` |
| mem0 設定與腳本 | 若不用，移到 `archive/legacy/<ts>/` | `mem0/`, `docker/mem0/`, `scripts/*mem0*` |
| pgadmin | 若只是本機輔助工具，先移出 active compose | `docker-compose.pgadmin*.yml`, `pgadmin/` |
| 舊 `.env.example` | 改成 dev / prod-live 雙模板，或保留但註明 legacy | `aiyo/.env.example` |
| 舊 search adapter code | 移除或改為 archive | 檔內搜尋 `searx`, `searxng`, `SEARXNG_URL` |
| 舊 memory adapter code | 若未使用則移除 | 檔內搜尋 `mem0`, `MEM0_` |

### 先封存再移除的命令

```bash
export LEGACY_DIR="archive/legacy/${TS}"
mkdir -p "${LEGACY_DIR}"

for p in \
  searxng docker/searxng ops/searxng \
  mem0 docker/mem0 ops/mem0 \
  pgadmin docker/pgadmin ops/pgadmin \
  docker-compose.searxng.yml docker-compose.mem0.yml docker-compose.pgadmin.yml \
  aiyo/.env.example .env.searxng .env.mem0 \
  scripts/start-searxng.sh scripts/*searx* scripts/*mem0*
do
  if [ -e "$p" ]; then
    mkdir -p "${LEGACY_DIR}/$(dirname "$p")"
    mv "$p" "${LEGACY_DIR}/$p"
  fi
done

# 搜尋殘留引用
rg -n "searx|searxng|SEARXNG|mem0|MEM0|pgadmin|PGADMIN" .
```

### 啟動與驗證指令清單

Compose 官方建議用 `docker compose config` 看最終展開結果，這對多 env、變數插值特別重要。`docker compose up -d` 會在背景啟動，`docker compose ps` 可看狀態，`docker compose logs -f` 可追問題。citeturn7view9turn7view11turn7view14turn7view13

```bash
# 先驗證 compose 是否可解析
docker compose config

# 啟動宿主機 Ollama 是否正常
curl http://127.0.0.1:11434/api/tags

# 啟動整個新堆疊
docker compose up -d --build

# 看狀態
docker compose ps

# 看關鍵 logs
docker compose logs -f open-webui
docker compose logs -f aiyo-new-app-dev
docker compose logs -f aiyo-new-app-prod-live
docker compose logs -f aiyo-new-postgres-dev
docker compose logs -f aiyo-new-postgres-prod
docker compose logs -f aiyo-new-redis

# 核對 DB / Redis 健康
docker compose exec aiyo-new-postgres-dev pg_isready -U aiyo -d aiyo_new_dev_db
docker compose exec aiyo-new-postgres-prod pg_isready -U aiyo -d aiyo_new_prod_db
docker compose exec aiyo-new-redis redis-cli ping

# 核對 Open WebUI 基本存活
curl http://127.0.0.1:8080/health
```

Open WebUI 官方監控文件把驗證分成三層：`/health`、`/api/models`、實際 `POST /api/chat/completions`。因此第一次啟動後，請先進 `http://127.0.0.1:8080` 建立**第一個管理員帳號**，到 Admin Settings 連線 Ollama，再去 Settings > Account 產生 API key。第一個帳號會自動成為 Admin，API key 功能則需實例層級啟用。citeturn18search1turn18search5turn9view0turn11view0

```bash
# 生成 Open WebUI API key 之後再測
export OPENWEBUI_API_KEY="replace-with-real-key"

curl -H "Authorization: Bearer ${OPENWEBUI_API_KEY}" \
  http://127.0.0.1:8080/api/models

curl -X POST http://127.0.0.1:8080/api/chat/completions \
  -H "Authorization: Bearer ${OPENWEBUI_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "granite4.1:8b",
    "messages": [{"role": "user", "content": "請只回覆 HEALTHY"}],
    "temperature": 0
  }'
```

### 遷移與測試 checklist

| 檢查項目 | 命令或動作 | 通過條件 |
| --- | --- | --- |
| Compose 語法 | `docker compose config` | 無錯誤，六個服務都出現在輸出中 |
| Host Ollama 可用 | `curl http://127.0.0.1:11434/api/tags` | 回傳模型列表 JSON |
| Open WebUI 存活 | `curl http://127.0.0.1:8080/health` | `200 OK` |
| Open WebUI 可見模型 | `GET /api/models` | 至少回傳一個 Ollama model |
| Open WebUI 端到端 | `POST /api/chat/completions` | 返回正常 completion |
| Dev App | 打開 `http://127.0.0.1:3000` | 頁面正常，功能可進 |
| Prod-live App | 打開 `http://127.0.0.1:3001` | 頁面正常，功能可進 |
| Dev DB 隔離 | 在 dev 寫入測試資料 | prod-live DB 不受影響 |
| Redis 正常 | `redis-cli ping` | `PONG` |
| searxng 移除後無殘留依賴 | `rg -n "searx|SEARXNG" .` | 只剩 archive 或文件註記 |
| mem0 移除後無殘留依賴 | `rg -n "mem0|MEM0" .` | 只剩 archive 或文件註記 |

### 回退計畫

Compose 官方說明 `docker compose down` 預設不刪 volumes，因此回退最重要的原則是：**不要先跑 `down -v`**。先停新堆疊、還原文字檔、再決定是否丟棄新 volumes。citeturn7view12

```bash
# 停掉新堆疊，但保留 volumes
docker compose down

# 還原 compose 與 env
cp -a "${BK}/docker-compose.yml" ./docker-compose.yml 2>/dev/null || true
cp -a "${BK}/aiyo/.env.dev" ./aiyo/.env.dev 2>/dev/null || true
cp -a "${BK}/aiyo/.env.prod-live" ./aiyo/.env.prod-live 2>/dev/null || true

# 如果你是用 git
git restore docker-compose.yml
git restore aiyo/.env.dev aiyo/.env.prod-live

# 重新啟動舊堆疊
docker compose up -d
```

若回退還牽涉到單一舊 PostgreSQL 的資料復原，則先重新建立舊 DB 容器，再把先前的 `pg_dumpall` 灌回去：

```bash
# 假設舊 postgres 容器已重建並可接受連線
cat "${BK}/old-postgres-all.sql" | docker exec -i "${OLD_DB_CONTAINER}" psql -U aiyo
```

若你確定要把新建立的 split DB volume 一併丟棄，再額外刪除：

```bash
docker volume rm \
  aiyo_new_postgres_dev_data \
  aiyo_new_postgres_prod_data \
  open_webui_data \
  aiyo_new_redis_data \
  aiyo_new_node_modules
```

## 安全與擴充說明

這個新堆疊在安全性上的第一個重點，是**port 不要對所有網卡廣播**。Docker 官方文件已明示，如果 `ports` 不指定 host IP，Compose 會綁到 `0.0.0.0`；因此本報告全部都用 `127.0.0.1:host:container`。這代表你在本機 Omen 開發時，瀏覽器與工具仍能使用，但 LAN 或公網不會直接看到 3000、3001、5432、5433、6379、8080。若未來要給團隊共用，再改由反向代理統一暴露，而不是直接把 DB/Redis 對外開。citeturn17search5turn17search11

第二個重點，是 **Open WebUI 一定要保留認證**。官方環境變數文件說 `WEBUI_AUTH` 預設是 `True`，不應在已有使用者的實例上任意關閉；而 API key 文件進一步指出，API keys 會繼承建立者的權限，而且最佳實務是用專用低權限帳號建立、不要提交到版本控制，也不要拿 admin key 給 backend 長期用。若你的未來部署前方還有會吃掉 `Authorization` header 的 reverse proxy，Open WebUI 也支援改用自訂 header 名稱。citeturn8view2turn9view0turn9view1

第三個重點，是 **`WEBUI_SECRET_KEY` 與 `ENABLE_PERSISTENT_CONFIG` 要有意識地設定**。Open WebUI 官方提醒：`WEBUI_SECRET_KEY` 用來簽 JWT 與保護敏感資料，且若 containers 重建時沒有固定 secret，會造成登出與 session 問題。另一方面，Open WebUI 的不少設定屬於 `ConfigVar`，預設會把 UI 裡改過的值寫進資料庫，之後重啟時，DB 版本會蓋過 env。這就是為什麼本報告在 compose 內建議 `ENABLE_PERSISTENT_CONFIG=false`：基礎設施設定應由 compose / env 檔主導，不要讓管理員在 UI 手動改了一次之後，`OLLAMA_BASE_URL`、`ENABLE_API_KEYS` 等值就和版本控制脫鉤。代價是：這些 ConfigVar 類設定在 UI 的變更不會跨重啟永久保留。citeturn8view4turn10view5turn8view1

`extra_hosts` 方面，Docker 官方文件說它會把主機名稱寫進容器的 `/etc/hosts`；`host.docker.internal:host-gateway` 是 Docker 提供的特殊值，可把容器導回宿主機。對 Open WebUI 而言，這正好對應官方推薦的 host Ollama 連線方式。不過你也要同時記得：Ollama 預設綁在 `127.0.0.1:11434`。在 Docker Desktop 上，`host.docker.internal` 一般可直接用；在 Linux Engine 若失敗，官方 troubleshooting 建議改用 host networking 或宿主機 IP。也就是說，`extra_hosts` 是正確的第一步，但不是所有 Linux 組合都保證零調整。citeturn17search0turn14search1turn7view0turn7view7turn2search3

在效能與擴展上，**目前這個六服務架構已經夠你做本機開發與展示**。Open WebUI 官方文件明確指出：單實例、`UVICORN_WORKERS=1` 時，不需要 Redis 也能正常運作；而其預設資料庫是位於 `DATA_DIR` 的 SQLite，單機單副本也屬合理用法。這就是為什麼本報告不建議在第一版就幫 Open WebUI 再加 PostgreSQL、Redis、外部 Vector DB。相反地，AIYO 自己的 Redis 留著即可，用於 queue、cache、job status；Open WebUI 則先用自己的 local volume。citeturn7view5turn8view8

當你進入以下任一情況時，才值得往下一級升級。若你要把 **Open WebUI 擴成多 worker 或多副本**，官方說必須同時滿足：共享 `WEBUI_SECRET_KEY`、外部 PostgreSQL、Redis WebSocket manager、共享 storage，以及**外部 Vector DB**；因為預設 ChromaDB 是本機 SQLite-backed，不適合 multi-worker / multi-replica。若你只是模型清單很多、外部 provider 慢，則可以先考慮 Open WebUI 的 model cache 設定，例如 `MODELS_CACHE_TTL`。若你要提高 Ollama 併發，也可先橫向增加多個 Ollama 實例，讓 Open WebUI 在 model IDs 一致時做基礎 load balancing。citeturn7view4turn8view5turn8view6turn8view7turn9view1turn7view0

至於 **何時才需要 mem0**，官方定位是「通用、可持久化、自我改良的 LLM memory layer」，強調跨 session、跨 user、跨 agent 的長期語意記憶。這意味著：若你目前只是 **AIYO 單一應用**，且你真正要保存的是使用者偏好、歷史行程、聊天紀錄、影片處理結果，那應該優先存回 AIYO 自己的 PostgreSQL。只有當你真的要讓多個 agent / 多個應用共用長期記憶，或需要自動記憶抽取與跨 agent 持續個人化時，mem0 才會從「額外複雜度」變成「基礎設施」。citeturn15search1turn15search3turn15search4turn15search11

最後，關於 **何時加外部 Vector DB**，這個門檻比 mem0 更清楚：只要 Open WebUI 的 RAG 開始進入多副本或高併發，官方已明講預設 ChromaDB 不安全，應改用 PGVector、Qdrant、Milvus 等外部向量庫。若你想沿用 PostgreSQL 生態，`pgvector/pgvector:pg16` 已提供官方維護映像，也是本報告選擇這個 Postgres base image 的原因之一。citeturn7view4turn7view2turn1view6turn13search0turn13search2