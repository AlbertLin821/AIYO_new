# Contract: Legacy API Aliases

## Canonical mapping

| Legacy | Canonical |
|---|---|
| `/api/ai/plan-trip` | `/api/ai/plan` |
| `/api/youtube/analyze` | `/api/videos/summarize` |
| `/api/chat/message` | `/api/ai/chat` |
| `/api/trip/revise` | `/api/trips/revise`（實作前先比對兩者語意） |

## Compatibility

- Legacy route 在本輪維持 method、status 與 response body 相容。
- Legacy response 加入標準 `Deprecation` header。
- 提供 canonical `Link` header；只有已有確定移除日期才加入 `Sunset`。
- Authentication、validation、rate limiting 與 error mapping 必須由 canonical handler 共用，不能複製分叉。
- Tests 必須驗證 header 與 body/status parity。

