# AIYO Map Migration Report

## 1. 原 Google Maps 架構

舊架構由 React 地圖元件直接載入 Google Maps JavaScript API，並在瀏覽器端管理 `Map`、Marker、InfoWindow、Directions 與 Places。伺服器端另有 Google Geocoding、Places、Routes 與照片代理。行程與地圖透過 Zustand 的 itinerary、pins、selectedPinId 與 pendingPoi 串接。

## 2. 新架構

正式路徑改為 `Frontend → /api/maps/* → MapService → provider adapter`。前端只接觸 AIYO 的 provider-independent JSON；地圖使用 MapLibre GL JS 與 OpenFreeMap，文字及反向地理編碼使用 Photon，附近 POI 使用 Overpass，路線與矩陣使用 OSRM。

## 3. 修改檔案

- 地圖入口：`src/app/map/page.tsx`、`src/app/trip/[id]/page.tsx`、`src/app/chat/page.tsx`、公開行程與影片摘要抽屜。
- 行程互動：`ItineraryEditorSection.tsx`、`ItineraryPanel.tsx`、pending POI 與地理編碼 action helpers。
- AI/規劃：旅遊規劃、研究工具、影片地點驗證、行程 hydration 與目的地 scope 全部改走統一服務。
- 部署：env examples、Docker、Next config、README 與 runtime config 移除 Google Maps 必要設定。

## 4. 新增檔案

- `src/components/map/MapLibreMapView.tsx`、`PublicMapLibre.tsx`
- `src/server/maps/*`：types、service、cache、errors、validation、rate limit、provider adapters
- `/api/maps/search|reverse|nearby|route|matrix`
- `osmPlacesSearchService.ts`、`osmRouteTravelTimeService.ts`
- Map service unit tests 與 `tests/e2e/maplibre-map.spec.ts`

## 5. 移除檔案

已移除未再引用的 Google Map React 元件、Google Maps loader、Google directions helper 與其舊測試。舊資料欄位及部分 server legacy compatibility helpers 暫留，避免破壞歷史資料與仍共用的評分邏輯。

## 6. 套件

新增 `maplibre-gl`。專案原本沒有需移除的 `@googlemaps/*`、`@react-google-maps/api` 或 `google-map-react` 套件。

## 7. Environment 變更

新增集中設定：`NEXT_PUBLIC_MAP_STYLE_URL`、`MAP_PHOTON_BASE_URL`、`MAP_OVERPASS_BASE_URL`、`MAP_OSRM_BASE_URL`、語言/國家預設值及各類 cache TTL。正式地圖不再需要 Google Maps API key。

## 8. Photon integration

支援 text search、near bias、bbox、語言、reverse geocoding、統一 `MapPoi` normalization、5 秒 timeout、快取、錯誤碼與短期 circuit breaker。搜尋框使用 300ms debounce 與 AbortController。

## 9. Overpass integration

Nearby 僅接受 allowlist category；restaurant、cafe、hotel、attraction、museum、park、convenience、parking、station 對應固定 OSM tags。radius、limit、timeout 與查詢形狀均由 server 限制，client 不能注入 Overpass QL。

## 10. OSRM integration

支援 route 與 table matrix，輸出標準 distance、duration 與 GeoJSON LineString。行程交通時間估算也已改用 OSRM adapter。

## 11. MapLibre integration

單一 map instance 在 mount 建立、unmount 清理；ResizeObserver 呼叫 resize。Marker 依 itinerary 差異新增、更新與移除，序號來自行程順序；selected pin 會 easeTo、高亮與顯示資訊面板。路線使用單一 GeoJSON source/line layer 更新。

## 12. OpenFreeMap integration

預設 style 為 `https://tiles.openfreemap.org/styles/liberty`，可由環境變數替換；保留 OpenFreeMap/OpenStreetMap attribution。

## 13. Cache

Map service 使用 provider-independent cache abstraction，search、reverse、nearby、route、matrix 皆採 normalization key 與獨立 TTL；目前為 process memory 實作，可在不改前端/API contract 下替換 Redis。

## 14. Error handling

外部請求皆有 timeout，錯誤轉為 MAP_LOAD/SEARCH/NEARBY/ROUTE/GEOCODE 類別。OSRM 失敗時 marker 保持可用，畫面以直線 GeoJSON fallback 並顯示提示；Photon/Overpass 失敗不會讓地圖或行程頁 crash。

## 15. Tests

- Unit：provider normalization、category、cache、validation、error/fallback、route/matrix。
- Browser：無 Google key 載入 MapLibre canvas、導航控制、搜尋結果、加入 marker、選取資訊與附近餐廳 marker。
- 驗證命令：TypeScript、ESLint、unit suite、Next production build、Playwright。

## 16. Legacy Google data compatibility

既有 `placeId`、照片 URL、rating 等欄位不刪除；lat/lng/name/address 仍能直接顯示。Google-only metadata 被視為 optional legacy data，不會偽造 OSM rating/review/photo。舊 Google photo proxy route 改為明確退場行為。

## 17. 尚未完成事項

無阻擋本次地圖遷移上線的程式工作。

## 18. 已知限制

公共 Photon/Overpass/OSRM 受第三方可用性與使用政策影響。本機驗證期間 Photon 公開站連線逾時，因此 browser integration 採 API mock；失敗與 circuit-breaker 行為已實測。OSM 不提供 Google 評分、評論、熱門時段及 Google Photos 等同資料。

## 19. 未來 self-host 建議

流量成長後，依現有三個集中 endpoint 逐步切換自架 Photon、Overpass 與 OSRM；在 MapService cache adapter 接 Redis，並對 provider latency、failure rate、cache hit rate 加入 metrics。API 與前端不需改動。
