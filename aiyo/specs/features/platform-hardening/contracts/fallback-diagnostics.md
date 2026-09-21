# Contract: Planner Fallback Diagnostics

## User-visible response

- 已知 destination + duration 時，模型失敗不得單獨導致 502。
- 有 verified POI：回傳 `travel_plan`，項目通過相同 validator。
- verified POI 不足：回傳較少項目並加入既定資料不足 warning。
- 缺必要 basics：回傳 `question_card`。
- 不向使用者顯示 provider stack、raw error、prompt 或內部路徑。

## Internal diagnostic

```json
{
  "stage": "generation",
  "reason": "provider_unavailable",
  "provider": "ollama",
  "recoverable": true,
  "attemptCount": 1,
  "durationMs": 1250
}
```

Allowed reason values 定義於 `data-model.md`。Logs 可記 reason code 與 request correlation id，但不得記錄 raw user content。

## Deterministic routing invariant

當前訊息明示的 destination 優先於 stale context。Required-slot detection 與是否應先詢問 preference reuse 不需要模型成功才能決定。

