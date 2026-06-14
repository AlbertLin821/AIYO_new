# AIYO App

這個目錄是 `AIYO_new` 的主應用程式。若你要看完整部署流程、Docker 服務拓樸、Open WebUI、mem0、Google OAuth 與 `.env` 設定，請先讀 repo root 的 [README.md](../README.md)。

這份 README 只補充 app 開發者最常用的內容。

## 你大多數時候會在哪裡工作

| 路徑 | 用途 |
|------|------|
| [src/](./src) | 前後端主程式 |
| [prisma/](./prisma) | Prisma schema 與 migration |
| [package.json](./package.json) | npm scripts |
| [docs/](./docs) | app 內部測試與設計文件 |
| [AGENTS.md](./AGENTS.md) | 進入 `aiyo/` 開發前要遵守的規則 |

## 環境變數

app 實際使用的是：

- [aiyo/.env.dev](./.env.dev)
- [aiyo/.env.prod-live](./.env.prod-live)

範例檔：

- [aiyo/.env.dev.example](./.env.dev.example)
- [aiyo/.env.prod-live.example](./.env.prod-live.example)

如果你改了以下任一組設定，請記得通常需要同時更新兩份：

- `NEXTAUTH_*`
- `OPENWEBUI_*`
- `MEM0_*`
- `OLLAMA_*`
- `GOOGLE_*`
- `NEXT_PUBLIC_GOOGLE_MAPS_*`

## 啟動方式

日常不要在 `aiyo/` 目錄直接手動組整套 Docker 指令，請回 repo root 用腳本：

```powershell
cd ..
.\dev-up.ps1
```

或：

```powershell
cd ..
.\prod-live-up.ps1
```

或：

```powershell
cd ..
.\all-up.ps1
```

如果你只想重建 app containers：

```powershell
cd ..
.\frontend-up.ps1
```

## 本地 app 指令

在這個目錄執行：

```powershell
npm install
npm run prisma:generate
npm test
npm run build
```

常用 E2E：

```powershell
npm run test:e2e:phase7
npm run test:e2e:phase8
```

Live AI 驗證：

```powershell
$env:E2E_LIVE_AI="1"
npm run test:e2e:live-ai:itinerary
```

## 開發時最常遇到的幾件事

### 1. Google 登入顯示未設定

請確認：

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

### 2. NextAuth 警告 `NEXTAUTH_URL is missing`

請確認：

- dev 用 `http://127.0.0.1:3000`
- prod-live 用 `http://127.0.0.1:3001`

### 3. AI 回應很慢或失敗

先檢查：

- `OPENWEBUI_API_KEY`
- `OPENWEBUI_MODEL`
- Open WebUI 是否能看到 Ollama 模型

### 4. 記憶功能看起來沒作用

先檢查：

- `MEM0_ENABLED=true`
- `MEM0_BASE_URL=http://aiyo-new-mem0:8890`
- `MEM0_API_KEY` 有值

## 參考文件

- [README.md](../README.md)
- [docs/README.md](../docs/README.md)
- [docs/architecture.md](../docs/architecture.md)
- [aiyo/docs/README.md](./docs/README.md)
