# Check Prerequisites

檢查 Spec-Driven Development 工作流程所需的先決條件，驗證必要的目錄和檔案是否存在。

## 檢查項目

### 必要檢查

1. **Feature 目錄**： 驗證 `specs/{feature-name}/` 目錄是否存在
2. **plan.md**：確認實作計畫檔案存在於 feature 目錄中
3. **Branch 驗證** 
   - 確認當前在 feature branch 上
   - Branch 命名格式應為： `001-feature-name`

### 選用檢查

根據需求檢查以下檔案是否存在：

- `tasks.md`： 任務清單 (實作階段需要)
- `research.md`： 研究文件
- `data-model.md`： 資料模型
- `contracts/`： 合約目錄
- `quickstart.md`： 快速入門指南

## 錯誤處理

如果發現以下問題，應該提供明確的錯誤訊息和解決建議：

- Feature 目錄不存在 → 建議先執行 `/speckit.specify`
- plan.md 不存在 → 建議先執行 `/speckit.plan`
- tasks.md 不存在 (需要時) → 建議先執行 `/speckit.tasks`
- 不在 feature branch 上 → 提示正確的 branch 命名格式
