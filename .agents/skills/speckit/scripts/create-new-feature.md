# Create New Feature

建立新的 feature，包括產生 branch 名稱、建立目錄結構，以及初始化 spec.md 檔案。

## 資訊確認

依上下文取得下列相關資訊：

- 新功能的自然語言描述。例如：實作 OAuth 授權機制

若無法取得上述資訊，請詢問我。

## 步驟

### 1. 確定下一個 Feature 編號

**IMPORTANT**: 必須檢查多個來源以避免編號衝突

使用 GitHub MCP 執行以下檢查：

1. **Remote branches**：
   - 使用 `list_branches` 列出所有遠端分支
   - 篩選符合 `[0-9]+-*` 格式的分支名稱
   - 提取開頭的數字部分
   - 找出最大的編號

2. **specs/ 目錄**：
   - 使用 `get_file_contents` 或相關功能列出 `specs/` 目錄內容
   - 找出所有符合 `[0-9]+-*` 格式的子目錄
   - 提取開頭的數字部分
   - 找出最大的編號

3. **合併結果並決定編號**：
   - 從 1 跟 2 兩個來源中找出最大的編號，並產生下一個編號
   - 格式化為 3 位數 (例如：`001`, `042`, `123`)
   - 如果兩個來源都沒有找到任何 feature，則從 `001` 開始

**範例**：
- Remote branches: `001-oauth`, `002-login`, `005-api` → 最大的編號 = 5
- specs/ 目錄: `001-oauth/`, `002-login/`, `003-cache/` → 最大的編號 = 3
- 結果: 5 跟 3 最大的編號是 5，下一個編號 = `006`

### 2. 產生功能短名

將「新功能的自然語言描述」轉換成英文簡短描述，目的是要成為一個分支名稱。

範例：
- "實作 OAuth 授權機制" → `oauth2-authorization`

**IMPORTANT**：GitHub Branch 名稱限制只有 244 bytes。為平常方便輸入與閱讀，因此限制字數不要超過 80 字元

### 3. 組合完整分支名稱

格式：`{編號}-{名稱}`

範例：
- `001-oauth2-authorization`
- `042-user-login`

### 4. 建立分支

使用 GitHub MCP 的 `create_branch` 功能建立新 branch：
- Branch 名稱：上一步驟產生的完整分支名稱
- Base branch：從 remote HEAD 建立

### 5. 初始化 spec.md

依 Skill 規範取得 spec-template 內容後，再透過 GitHub MCP 建立檔案到新分支：
- 新分支：上一步驟產生的完整分支名稱
- 路徑：`specs/{分支名稱}/spec.md`
- 例如：`specs/001-oauth2-authorization/spec.md`

## 錯誤處理

遇到任何錯誤時：
1. 清楚說明錯誤原因
2. 立即停止執行，不繼續後續步驟

常見錯誤：
- 無法掃描 `specs/` 目錄 → 說明目錄不存在或無法存取
- 分支名稱已存在 → 說明分支名稱衝突
- GitHub MCP 建立分支失敗 → 說明失敗原因（權限、網路等）
- 無法讀取或寫入檔案 → 說明檔案路徑和權限問題
- 所有 template 都找不到 → 說明已嘗試的路徑
