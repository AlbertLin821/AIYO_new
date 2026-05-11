# YouTube 影片資訊擷取器

本專案提供網頁介面，輸入 YouTube 網址後可取得影片中繼資料（標題、頻道、描述、標籤等）、官方字幕（若可用），並在無字幕時以 **Faster-Whisper**（預設於 GPU 使用較快的 **turbo**，見下文 **WHISPER_MODEL**）自動轉錄音軌作為備援。前端為 React，後端為 FastAPI。

---

## 功能摘要

- 自多種 YouTube 網址格式解析 **影片 ID**（watch、shorts、youtu.be、embed、live 等）。
- 透過 **yt-dlp** 取得影片中繼資料（無需下載完整影片檔）。
- 透過 **youtube-transcript-api** 取得官方字幕；請求預設 **`zh-TW`**，語言優先順序仍可自訂。**所有對外字幕內容**（含官方字幕、AI 轉錄、SRT／VTT／純文字匯出與 API 回應）會以 **zhconv** 規範為**台灣繁體中文**（拉丁字元大致保留原樣）。
- 若無可用官方字幕，後端可自動改以 **yt-dlp 擷取音軌 + Faster-Whisper** 產生字幕。
- 前端可檢視分段字幕、複製完整 JSON、匯出 **SRT／VTT／純文字**。
- 可手動觸發「改用 AI 轉錄」，並選擇是否使用 **逐詞時間標記**（會呼叫 `/api/transcribe`）。

---

## 技術架構

| 層級 | 技術 |
|------|------|
| 前端 | React 19、TypeScript、Vite 8 |
| 後端 | Python 3、FastAPI、Pydantic |
| 影片資訊 | yt-dlp（僅擷取 metadata，或下載音軌供轉錄） |
| 官方字幕 | youtube-transcript-api |
| AI 轉錄 | faster-whisper（預設 GPU：`turbo`；CPU：`small`；見環境變數 **WHISPER_MODEL**）、PyTorch |
| 開發連線 | Vite 將 `/api` **proxy** 至 `http://localhost:8000`（見 `vite.config.ts`） |

### 後端行為補充

- **Whisper 模型**：預設在有 CUDA 時使用 **`turbo`**（`large-v3-turbo`，速度取向），無 GPU 時使用 **`small`** 以降低 CPU 負擔。若設定環境變數 **`WHISPER_MODEL`**（例如 `medium`、`distil-large-v2`、`tiny`），則以此為準。首次使用某模型時會下載對應權重；快取目錄為環境變數 `TEMP` 底下的 `whisper-models`。
- **裝置**：若偵測到 CUDA，Whisper 使用 GPU（`float16`）；否則使用 CPU（`int8`）。
- **FFmpeg**：AI 轉錄流程需將音軌轉成 MP3，請於系統中安裝 **FFmpeg** 並可在指令列中呼叫；若未安裝，可能出現「音訊下載失敗」類錯誤。
- **CORS**：後端目前允許任何來源（`allow_origins=["*"]`），若要用於正式環境請自行縮小範圍。
- **字幕用字**：伺服器在回傳字幕前會以 **zhconv**（`zh-tw`）將文字轉為台灣慣用繁體；Faster-Whisper 轉錄時亦以 `initial_prompt` 引導輸出繁體，再經同一套轉換以處理簡體或未轉寫之異體字。

---

## 先決條件

- **Node.js**（建議與專案相容的現行 LTS 版本）
- **Python 3.10+**（建議）
- **FFmpeg**（已加入 PATH，供 yt-dlp 擷取／轉檔音訊）
- （選用）**NVIDIA GPU + CUDA**：可加速 Whisper 推論

---

## 安裝方式

### 1. 前端依賴

在專案根目錄執行：

```bash
npm install
```

### 2. 後端依賴

```bash
cd server
python -m venv .venv
```

Windows PowerShell（啟用虛擬環境後安裝）：

```powershell
.\.venv\Scripts\Activate.ps1
pip install -U pip
pip install -r requirements.txt
```

macOS／Linux：

```bash
source .venv/bin/activate
pip install -U pip
pip install -r requirements.txt
```

**GPU（NVIDIA）**：`requirements.txt` 會透過 PyTorch 官方的 **`cu130`** 索引安裝 CUDA 13.0 對應的 `torch`／`torchaudio`，並一併安裝 `nvidia-cublas-cu12`（供 Windows 上載入 CUDA DLL）。請確認網路可連線至 `download.pytorch.org`。

**僅 CPU／無 NVIDIA**：請改為：

```bash
pip install -r requirements-cpu.txt
```

共用套件列於 `requirements-base.txt`。請勿將 **setuptools** 升級到 **82 或以上**，以免與目前 PyTorch 套件的中繼資料宣告衝突。首次安裝與首次載入 Whisper 模型可能較耗時與磁碟空間。

---

## 如何執行（本機開發）

需同時啟動 **後端（連接埠 8000）** 與 **前端（連接埠 5173）**。前端會將 `/api` 請求轉發至後端，因此請固定使用下方連接埠，或一併修改 `vite.config.ts` 的 proxy 設定。

### 終端機一：後端

```bash
cd server
.\.venv\Scripts\Activate.ps1
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

確認後端正常：

```bash
curl http://127.0.0.1:8000/api/health
```

### 終端機二：前端

在專案根目錄：

```bash
npm run dev
```

瀏覽器開啟 Vite 提示的網址（預設為 `http://localhost:5173`）。於頁面貼上 YouTube 網址、選擇語言偏好後按「擷取資訊」。

### 正式建置前端（靜態檔）

```bash
npm run build
npm run preview
```

若靜態網站與 API 不同網域，需設定 **CORS** 與 **API 基底網址**（目前前端使用相對路徑 `''`，預期與 API 同源或由反向代理合併路徑）。

---

## 後端 API 一覽

基底路徑於開發時透過 Vite 代理為：`http://localhost:5173/api/...` → `http://localhost:8000/api/...`。

| 方法 | 路徑 | 說明 |
|------|------|------|
| GET | `/api/health` | 健康檢查；回傳 Whisper 模型名稱與是否可用 CUDA |
| POST | `/api/youtube-info` | Body：`{ "url": string, "language": string }`。回傳 video_id、metadata、transcript；無官方字幕時會自動嘗試 AI 轉錄 |
| POST | `/api/transcribe` | Body：`{ "url", "language", "word_timestamps" }`。強制走 AI 轉錄 |
| GET | `/api/transcribe/progress` | 回傳目前轉錄進度（全域狀態；並發多使用者時可能互相覆蓋） |
| GET | `/api/transcript/srt` | Query：`video_id`（必填）、`use_ai`、`language`、`word_timestamps`。下載 SRT |
| GET | `/api/transcript/vtt` | 同上（無 `word_timestamps`）。下載 WebVTT |
| GET | `/api/transcript/json` | Query：`video_id`、`use_ai`、`language`。下載純文字（副檔名仍為 `.txt`） |
| GET | `/api/ollama/models` | 轉查本機 Ollama `GET /api/tags` 已安裝模型（短暫快取，見環境變數 `OLLAMA_MODELS_CACHE_TTL_SEC`） |
| POST | `/api/ollama/transcript/outline` | Body：`model`、`segments`（與 `transcript_content` 同形），選填 `temperature`、`num_ctx`。語意切段、段落大意、`travel_keywords` |

詳細請求／回應結構可參考 `server/main.py` 內 Pydantic 模型與路由實作。後端對 Ollama 的預設連線為 **`http://127.0.0.1:11434`**；環境變數 **`OLLAMA_HOST`** 可覆寫（僅寫主機埠時會自動補上 `http://`）。**請注意：** Ollama 設定裡常見 **`0.0.0.0:11434`** 表示「在所有介面監聽」，並**不是**你應寫進 `OLLAMA_HOST` 的目的位址；若誤設 `http://0.0.0.0:11434`，程式會自動改連 **`127.0.0.1`**。`GET /api/ollama/models` 在無法連線時仍回 **HTTP 200**，並以 **`ollama_reachable: false`** 與 **`detail`** 說明原因，便於僅使用擷取／轉錄功能時不把「未啟動 Ollama」視為代理錯誤。

---

## 專案目錄結構（精簡）

```
youtube-proj/
├── server/
│   ├── main.py                  # FastAPI 應用程式與業務邏輯
│   ├── ollama_client.py         # 呼叫本機 Ollama HTTP API
│   ├── transcript_outline.py    # 字幕語意切段／旅遊關鍵詞（經 Ollama）
│   ├── requirements.txt         # GPU：PyTorch cu130 + 共用依賴
│   ├── requirements-cpu.txt     # CPU：PyTorch cpu + 共用依賴
│   └── requirements-base.txt    # 共用依賴（不含 PyTorch）
├── src/
│   ├── App.tsx           # 主要頁面與 API 呼叫
│   ├── components/       # JsonSection、JsonView、TranscriptViewer 等
│   └── ...
├── vite.config.ts        # 開發伺服器與 /api 代理
├── package.json
└── README.md
```

---

## 疑難排解

- **開發時 `502 Bad Gateway`、`read ECONNRESET`（經 Vite 代理）**：長時間請求（批次擷取且需 **Whisper** 轉錄）可能超過代理逾時；`vite.config.ts` 已將 `/api` 代理逾時預設拉長（並可用環境變數 **`VITE_API_PROXY_MS`** 調整，單位毫秒）。另請勿在長時間轉錄進行中存檔觸發 **`uvicorn --reload`**，否則子行程重啟會中斷連線並回傳代理錯誤；長任務建議改用 **`uvicorn main:app --host 127.0.0.1 --port 8000`**（不加 `--reload`）。
- **段落大意顯示無法連線 Ollama**：Uvicorn 仍可能對 `GET /api/ollama/models` 記 **`200 OK`**（回應 JSON 會帶 `ollama_reachable: false`），代表 **後端** 對本機 Ollama 連線失敗，不是瀏覽器連後端失敗。請確認 [Ollama](https://ollama.com) 已安裝且服務在執行；在 **與 uvicorn 相同**的終端機執行 `curl http://127.0.0.1:11434/api/tags` 應可取回 JSON。**`HTTP_PROXY`／`HTTPS_PROXY`** 若指向需登入或不支援本機位址的代理，曾導致 `httpx` 無法連上 `127.0.0.1`（本專案對 Ollama 請求已設 **`trust_env=False`**，不套用環境代理）。前端每輪批次成功後只請求一次模型清單；後端對該路徑有短 TTL 快取。
- **`pip install` 與 PyTorch／setuptools 相關錯誤**：請使用本儲存庫中的 `requirements.txt`（GPU）或 `requirements-cpu.txt`（CPU），並維持 `setuptools<82`。重新建立乾淨虛擬環境後再安裝通常可排除版本混用。
- **`cublas64_12.dll is not found`（Windows GPU 轉錄）**：CTranslate2 需要 CUDA 12 的 **cuBLAS**（`nvidia-cublas-cu12`）。請確認已用 `requirements.txt` 安裝依賴並拉取最新後端程式（啟動時會註冊 `nvidia/*/bin` 至 DLL 搜尋路徑與 **PATH**）。若仍失敗，可關閉終端機後重新啟用虛擬環境再啟動；必要時暫時隱藏 GPU 強制走 CPU（PowerShell：`$env:CUDA_VISIBLE_DEVICES=""` 後再執行 uvicorn）。
- **前端顯示請求失敗**：確認後端已於 `8000` 埠啟動，且 Vite dev server 已啟動。
- **AI 轉錄失敗並提及 FFmpeg**：安裝 FFmpeg 並確認 `ffmpeg -version` 可在終端機執行。
- **Whisper 第一次很慢**：需下載所選模型（例如 `turbo`）；之後會較快。
- **CPU 轉錄長影片耗時**：屬預期現象；有 NVIDIA GPU 時請安裝對應的 CUDA 版 PyTorch 以加速（請參考 [PyTorch 官網](https://pytorch.org/) 安裝指引）。

---

## 授權與合規提醒

請遵守 YouTube 服務條款與適用法律，僅在合法範圍內擷取公開影片資訊與字幕；大量請求可能觸發平台限制，請自行控制頻率與用途。
