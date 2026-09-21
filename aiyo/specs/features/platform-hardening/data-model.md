# Logical Data Model

本功能不新增 Prisma schema 或 database migration。以下為程式內合約與狀態模型。

## FallbackDiagnostic

| Field | Type | Rules |
|---|---|---|
| `stage` | enum | `intent`, `question_card`, `research`, `generation`, `validation` |
| `reason` | enum | `provider_unavailable`, `timeout`, `http_error`, `invalid_response`, `insufficient_verified_data`, `quality_rejected` |
| `provider` | optional string enum | 只允許已知 provider identifier，不存 URL/key |
| `recoverable` | boolean | 是否已由 deterministic/verified fallback 接手 |
| `attemptCount` | integer | `0..2`，符合 JSON retry 最多一次原則 |
| `durationMs` | non-negative integer | 供 metrics 使用 |

禁止欄位：raw prompt、raw response、API key、cookie、email、完整個人偏好。

## ModelGateway

```ts
interface ModelGateway {
  complete(request: ModelCompletionRequest): Promise<string>;
}
```

Production gateway 封裝 Ollama/Open WebUI；unit test gateway 由案例顯式注入。Gateway 失敗需轉成既有 typed provider error，不直接決定 HTTP response。

## PhotoProxyPolicy

| Field | Type | Initial design |
|---|---|---|
| `maxWidth` | integer | 1600 |
| `timeoutMs` | integer | 依現有 route latency baseline 決定，需 bounded |
| `allowedTypes` | set | `image/jpeg`, `image/png`, `image/webp`, `image/avif`（依 upstream實測調整） |
| `maxBytes` | integer | 依最大寬度與 upstream baseline 設定 |
| `windowMs` | integer | 可設定固定窗口 |
| `maxRequests` | integer | 可設定每 identity 上限 |

## RequestIdentity

來源優先序：受信任 proxy header（僅在部署設定允許）→ remote-derived value → 匿名共享 bucket。不得把任意 client-supplied header 無條件視為可信身份。

## ApiAliasMetadata

| Field | Meaning |
|---|---|
| `canonicalPath` | 新 client 應使用的 endpoint |
| `deprecated` | legacy route 固定為 true |
| `sunset` | 僅在確定移除日期後提供 |
| `documentation` | canonical contract reference |

## BrowserQaCase

| Field | Type |
|---|---|
| `id` | string |
| `area` | enum: home/auth/chat/itinerary/map/settings/video/collaboration/publication |
| `preconditions` | string[] |
| `steps` | string[] |
| `expected` | string[] |
| `actual` | string |
| `status` | `PASS`, `FAIL`, `BLOCKED` |
| `evidence` | optional screenshot/note |
| `blocker` | optional external constraint |

## Existing Persistent Entities

`User`, `Trip`, `TripDay`, `TripItem`, `MapPin`, `TripPublication`, `TripCollaborator`, `CollaborationRoom` 與 `Comment` 維持現有 schema。本輪只驗證 access control、snapshot visibility 與 cascade 行為，不修改 relation。

