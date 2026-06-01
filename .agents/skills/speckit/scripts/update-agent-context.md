# Update Agent Context

從 plan.md 提取專案資訊，更新 AI agent context 檔案 (如 CLAUDE.md, GEMINI.md 等)，確保 AI 助手能夠掌握專案的最新技術棧和變更歷史。

## 支援的 Agent 類型

| Agent 類型 | 檔案路徑 | 說明 |
|-----------|---------|------|
| claude | `CLAUDE.md` | Claude Code |
| gemini | `GEMINI.md` | Gemini CLI |
| copilot | `.github/copilot-instructions.md` | GitHub Copilot |
| cursor-agent | `.cursor/rules/specify-rules.mdc` | Cursor IDE |
| qwen | `QWEN.md` | Qwen Code |
| opencode | `AGENTS.md` | opencode |
| codex | `AGENTS.md` | Codex CLI |
| windsurf | `.windsurf/rules/specify-rules.md` | Windsurf |
| kilocode | `.kilocode/rules/specify-rules.md` | Kilo Code |
| auggie | `.augment/rules/specify-rules.md` | Auggie CLI |
| roo | `.roo/rules/specify-rules.md` | Roo Code |
| codebuddy | `CODEBUDDY.md` | CodeBuddy CLI |
| q | `AGENTS.md` | Amazon Q Developer CLI |

## 主要功能

### 1. 環境驗證

檢查以下項目：
- 當前 feature/branch 是否可識別
- plan.md 是否存在
- Template 檔案是否存在 (建立新檔案時需要)

### 2. Plan 資料提取

從 plan.md 提取以下資訊：

#### 欄位對應

| Plan 欄位 | 變數名稱 | 說明 |
|----------|---------|------|
| `**Language/Version**:` | NEW_LANG | 程式語言和版本 |
| `**Primary Dependencies**:` | NEW_FRAMEWORK | 主要框架和套件 |
| `**Storage**:` | NEW_DB | 資料庫和儲存方案 |
| `**Project Type**:` | NEW_PROJECT_TYPE | 專案類型 |

#### 提取規則

- 使用正規表達式匹配欄位: `^\*\*{欄位名稱}\*\*: `
- 移除前後空白
- 過濾掉 "NEEDS CLARIFICATION" 和 "N/A" 值
- 如果欄位不存在或為空，使用空字串

### 3. Agent 檔案管理

#### 建立新檔案

當 agent 檔案不存在時：

1. **使用 Template**: `.specify/templates/agent-file-template.md`
2. **替換佔位符**:
   - `[PROJECT NAME]` → 專案名稱 (從 repo root 取得)
   - `[DATE]` → 當前日期 (YYYY-MM-DD)
   - `[EXTRACTED FROM ALL PLAN.MD FILES]` → 技術棧清單
   - `[ACTUAL STRUCTURE FROM PLANS]` → 專案目錄結構
   - `[ONLY COMMANDS FOR ACTIVE TECHNOLOGIES]` → 建置/測試命令
   - `[LANGUAGE-SPECIFIC, ONLY FOR LANGUAGES IN USE]` → 語言慣例
   - `[LAST 3 FEATURES AND WHAT THEY ADDED]` → 最近變更

3. **產生專案目錄結構**:
   - Web 專案: `backend/\nfrontend/\ntests/`
   - 其他專案: `src/\ntests/`

4. **產生語言特定命令**:
   - Python: `cd src && pytest && ruff check .`
   - Rust: `cargo test && cargo clippy`
   - JavaScript/TypeScript: `npm test && npm run lint`

#### 更新現有檔案

1. **更新 Active Technologies 章節**:
   - 格式化技術棧: `{語言} + {框架}`
   - 加入新技術項目: `- {技術棧} ({branch})`
   - 加入資料庫 (如果有): `- {資料庫} ({branch})`
   - 避免重複項目

2. **更新 Recent Changes 章節**:
   - 加入新變更記錄: `- {branch}: Added {技術棧}`
   - 保留最近 3 筆記錄 (包含新增的)
   - 移除較舊的記錄

3. **更新時間戳記**:
   - 尋找 `**Last updated**: YYYY-MM-DD`
   - 更新為當前日期

### 4. 多 Agent 支援

#### 更新單一 Agent

指定 agent 類型參數：
```
update-agent-context [agent_type]
```

#### 更新所有現有 Agent

不指定參數時：
- 掃描所有可能的 agent 檔案路徑
- 更新所有存在的檔案
- 如果沒有任何 agent 檔案存在，建立預設的 CLAUDE.md

## 實作流程

### 步驟 1: 驗證環境

```
1. 檢查 CURRENT_BRANCH 是否可識別
2. 檢查 plan.md 是否存在
3. 檢查 template 是否存在 (建立新檔案時)
```

### 步驟 2: 解析 Plan 資料

```
1. 讀取 plan.md 內容
2. 提取各個欄位值
3. 記錄提取到的資訊
```

### 步驟 3: 處理 Agent 檔案

對於每個要更新的 agent：

```
1. 確定檔案路徑
2. 建立必要的目錄結構
3. 如果檔案不存在:
   - 從 template 建立新檔案
   - 替換所有佔位符
4. 如果檔案已存在:
   - 讀取現有內容
   - 更新 Active Technologies 章節
   - 更新 Recent Changes 章節
   - 更新時間戳記
5. 寫入更新後的內容
```

### 步驟 4: 顯示摘要

```
1. 列出新增的語言
2. 列出新增的框架
3. 列出新增的資料庫
```

## 資料格式化

### 技術棧格式化

```
單一元件: "Python 3.11"
兩個元件: "Python 3.11 + FastAPI"
多個元件: "Python 3.11 + FastAPI + SQLAlchemy"
```

### 變更記錄格式

```
- {branch}: Added {技術棧}
- 001-user-auth: Added Python 3.11 + FastAPI
- 002-api-integration: Added Redis
```

## 錯誤處理

### 無法識別 Feature

```
ERROR: Unable to determine current feature
Make sure you're on a feature branch
```

或 (非 Git 專案):

```
ERROR: Unable to determine current feature
Set SPECIFY_FEATURE environment variable or create a feature first
```

### Plan.md 不存在

```
ERROR: No plan.md found at {path}
Make sure you're working on a feature with a corresponding spec directory
```

提示 (非 Git 專案):

```
Use: export SPECIFY_FEATURE=your-feature-name or create a new feature first
```

### Template 不存在

```
WARNING: Template file not found at {path}
Creating new agent files will fail
```

### 建立檔案失敗

```
ERROR: Failed to create directory: {path}
ERROR: Failed to copy template file
ERROR: Failed to perform substitution: {substitution}
```

### 更新檔案失敗

```
ERROR: Cannot read existing file: {path}
ERROR: Cannot write to existing file: {path}
ERROR: Failed to update target file
```

## 實作建議

### 使用 Read 工具

讀取檔案內容：
```
- plan.md
- 現有的 agent 檔案
- template 檔案
```

### 使用 Edit 工具

更新現有 agent 檔案的特定章節。

### 使用 Write 工具

建立新的 agent 檔案。

### 使用 GitHub MCP

Git 相關操作：
- `get_repository_info`: 取得 repository root 和專案資訊
- `get_current_branch`: 取得當前 branch 名稱

### 使用 Bash 工具

基本系統操作：
```bash
# 取得當前日期
date +%Y-%m-%d

# 建立目錄
mkdir -p {dir}
```

### 字串處理

在 prompt 中進行：
- 提取 plan 欄位值
- 格式化技術棧
- 組合變更記錄
- 替換 template 佔位符

## 範例

### 範例 1: 建立新 Claude 檔案

輸入:
```
plan.md 內容:
  **Language/Version**: Python 3.11
  **Primary Dependencies**: FastAPI, SQLAlchemy
  **Storage**: PostgreSQL
  **Project Type**: Web API
```

處理:
1. 提取資訊: Python 3.11, FastAPI + SQLAlchemy, PostgreSQL
2. 從 template 建立檔案
3. 替換佔位符:
   - 技術棧: `- Python 3.11 + FastAPI, SQLAlchemy (001-user-auth)`
   - 專案結構: `backend/\nfrontend/\ntests/`
   - 命令: `cd src && pytest && ruff check .`

輸出:
```
✓ Created new Claude Code context file
Summary of changes:
  - Added language: Python 3.11
  - Added framework: FastAPI, SQLAlchemy
  - Added database: PostgreSQL
```

### 範例 2: 更新現有檔案

現有 CLAUDE.md:
```markdown
## Active Technologies
- JavaScript + React (001-frontend)

## Recent Changes
- 001-frontend: Added JavaScript + React
```

新 plan.md:
```
**Language/Version**: Python 3.11
**Primary Dependencies**: FastAPI
```

更新後:
```markdown
## Active Technologies
- JavaScript + React (001-frontend)
- Python 3.11 + FastAPI (002-backend)

## Recent Changes
- 002-backend: Added Python 3.11 + FastAPI
- 001-frontend: Added JavaScript + React
```

### 範例 3: 更新所有 Agent

執行時不指定 agent 類型：

```
INFO: No agent specified, updating all existing agent files...
INFO: Updating Claude Code context file: CLAUDE.md
✓ Updated existing Claude Code context file
INFO: Updating Cursor IDE context file: .cursor/rules/specify-rules.mdc
✓ Updated existing Cursor IDE context file

Summary of changes:
  - Added language: Python 3.11
  - Added framework: FastAPI
```

## 安全考量

### 檔案權限

- 檢查檔案是否可讀 (更新前)
- 檢查檔案是否可寫 (更新前)
- 使用臨時檔案進行更新 (原子操作)

### 資料驗證

- 驗證提取的資料不包含惡意內容
- 過濾掉 "NEEDS CLARIFICATION" 等特殊標記
- 確保路徑安全 (不包含 `../` 等)

### 錯誤恢復

- 使用臨時檔案
- 更新失敗時清理臨時檔案
- 保留原始檔案內容

## 整合說明

此功能通常整合在以下命令中：
- `/speckit.plan`: 完成計畫後自動更新
- `/speckit.implement`: 開始實作前確保 context 最新
- 獨立命令: 允許手動觸發更新
