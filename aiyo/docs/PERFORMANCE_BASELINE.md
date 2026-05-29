# UI 效能基線（AIYO）

建立日期：2026-05-28

## 量測方式

### Bundle 分析（Turbopack）

```bash
cd aiyo
npm run build:analyze
# 或互動式：npm run analyze
```

產物目錄：`.next/diagnostics/analyze/`（若 CLI 支援）。

### 生產建置路由類型（最近一次 `next build`）

| 路由 | 類型 |
|------|------|
| `/` | 靜態（Static） |
| `/map`, `/chat`, `/itinerary`, `/login`, `/profile` | 動態（Dynamic） |
| `/itinerary/public/[publicationId]` | 動態 |
| `/trip/[id]` | 動態 |

### Lighthouse（手動）

在 `npm run build && npm run start` 後，對下列 URL 執行 Lighthouse（行動裝置模擬）：

- `http://localhost:3000/`
- `http://localhost:3000/map`
- `http://localhost:3000/itinerary`
- `http://localhost:3000/chat`

記錄：Performance 分數、LCP、TBT、CLS、First Load JS（若有）。

### 預期最大 client chunk（調研結論）

1. `framer-motion`（全站動畫 + Sidebar `layoutId`）
2. 地圖相關（`MapView` 動態載入，Google Maps SDK 為執行期 script）
3. `/itinerary`（大型 client 頁）

## 已實作優化（本計畫）

- AppLayout：Modal / CursorSparkle 延遲載入
- `LazyMotion` + `m` 元件（`domMax`）
- Google Maps：`importLibrary('maps')` 按需載入（移除 script 上 `libraries=places`）
- React Compiler：`compilationMode: 'annotation'`
- 公開行程區段：`Suspense` 邊界（`app/itinerary/public/layout.tsx`）
- `cacheComponents`：尚未全域啟用（與多數 API 的 `export const dynamic = "force-dynamic"` 不相容；啟用前需逐路由遷移）
