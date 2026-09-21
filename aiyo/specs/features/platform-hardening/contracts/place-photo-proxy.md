# Contract: Place Photo Proxy

## Endpoint

`GET /api/map/place-photo?ref=<photo-reference>&maxwidth=<1..1600>&placeId=<optional>`

## Success

- `200`
- `Content-Type` 必須為允許的 image MIME。
- `Cache-Control` 保持 public cache，並在資料安全前提下允許 CDN reuse。
- Body 不超過 policy max bytes。

## Errors

- `400`: key 缺失、ref 無效、width 非法。
- `429`: request identity 超過窗口上限；包含 `Retry-After`。
- `404`: upstream 明確找不到資源。
- `502`: upstream HTTP failure、unsupported content、body 超限。
- `504`: upstream timeout。

錯誤 body 不得包含 Google URL、key、photo reference 或 upstream raw body。

## Security

- 只可呼叫固定 Google Places photo origin。
- redirect 後的最終 URL/content 必須受 policy 約束。
- `placeId` refresh 最多額外嘗試一次。
- limiter 是最低保護；多 instance production 應由 shared gateway/Redis/CDN 補強。

