# 台灣、日本、韓國本地地圖導入

現有程式可逐服務切換供應端。`MAP_PHOTON_BASE_URL` 指向自架 Photon；`MAP_OVERPASS_TW_URL`、`MAP_OVERPASS_JP_URL`、`MAP_OVERPASS_KR_URL` 與 `MAP_OSRM_*_URL` 依座標使用區域服務。未設定時維持現有公開端點。這些開關須在資料匯入、健康檢查、固定案例比對完成後才設定到正式環境。

## 建置資料

從 repository 根目錄執行 `docker compose -f docker-compose.maps.yml --profile maps up -d`。首次啟動 Photon Asia 與三個 Overpass 資料庫會下載並建索引，可能耗時數小時及大量磁碟。`Photon Asia` 包含台灣、日本、韓國，但不是只含三地。區域 Overpass 以 Geofabrik PBF 初始化，應另訂資料更新排程，並記錄 PBF 日期；目前 Compose 不會自動更新。

本地開發 Compose 使用既有 `aiyo_new_backend` Docker 網路，讓 app 容器能以 `photon-asia`、`overpass-tw`、`overpass-jp`、`overpass-kr`、`osrm-tw`、`osrm-jp`、`osrm-kr`、`searxng` 服務名稱連線。首次匯入後若 Overpass 健康檢查持續顯示 `starting`，檢查 `/api/interpreter` 的回應內容；本次部署的映像把 `/db` 設成 `700`，導致 Web 使用者無法讀取資料庫。執行 `powershell -NoProfile -File scripts/check-map-services.ps1 -FixOverpassPermissions` 可修復權限。腳本會實際查 Photon、三地 Overpass／OSRM／圖磚及 SearXNG；`-Region tw|jp|kr` 可縮小區域服務檢查範圍，任何必要服務不可查詢時回傳非零退出碼。重啟後仍會保留權限。

路線資料依序執行 `powershell -File scripts/prepare-map-region.ps1 -Region tw`、`jp`、`kr`；成功後啟動 `docker compose -f docker-compose.maps.yml --profile routing up -d`。OSRM 資料在 `map-data/`，已排除 Git。公開 OSRM 僅作未啟用區域或跨區路線的過渡備援。

圖磚可從根目錄分別執行 `powershell -File scripts/prepare-map-tiles.ps1 -Region tw`、`jp`、`kr`，從 VersaTiles 的開放 OSM 資料裁切三地區向量圖磚；三份檔案和前端樣式包都完成後，執行 `docker compose -f docker-compose.maps.yml --profile tiles up -d tiles`。MapLibre 目前仍使用 OpenFreeMap 底圖；須先逐區驗證字體、道路與 POI 呈現、確認本地樣式 URL 與授權標示後，才設 `NEXT_PUBLIC_MAP_STYLE_URL`。不可只啟動空圖磚服務就切換預設。

日本圖磚目前最高縮放級別設為 13，較高縮放會放大既有圖磚；台灣、韓國維持資料源預設級別。三份本地圖磚已能由 `/tiles/{tw|jp|kr}/tiles.json` 提供。於 `aiyo/` 執行 `node scripts/generate-local-map-styles.mjs http://127.0.0.1:8088`，用 `@versatiles/style` 產生三份 MapLibre 樣式，包含本地圖磚、字型、精靈圖與 OSM 授權標示。正式環境需改傳瀏覽器可連的圖磚網域並在每次資料或網域變更後重產。生成檔在 `public/local-map-styles/`，不進 Git。設定 `NEXT_PUBLIC_USE_LOCAL_MAP_STYLES=true` 後依行程目的地選用地區樣式；未知或跨國目的地維持既有底圖。啟用前仍需實走高縮放可讀性。

## 啟用與驗證

在 Windows 主機直接執行 Playwright 時，Docker 內部的 `photon-asia` 等服務名稱不可解析。先確認 `docker compose -f docker-compose.maps.yml --profile maps --profile routing up -d` 已啟動服務，再於 `aiyo/` 設 `$env:PLAYWRIGHT_HOST_LOCAL_MAPS='1'`，執行所需的 Playwright 測試。測試設定會使用映射至 `127.0.0.1` 的 Photon、三區 Overpass／OSRM 端口，並停用公開備援；手動設定的 `MAP_*` 仍優先。主機 Playwright 的 Next 開發產物使用 `.next-dev-host-e2e/`，Docker 開發容器仍使用 `.next-dev/`，避免同時運行時覆寫彼此的編譯檔。

1. 檢查 Photon `/api?q=台北101`、各 Overpass `/api/interpreter`、OSRM `/route/v1/driving/...`，並記錄索引日期、回應時間、失敗率。
2. 對台北 101、阿里山、淺草寺、福岡塔、景福宮、濟州島等固定景點及附近餐廳，比對現有端點與本地端點的命中、座標誤差、距離和延遲。
3. 先將 `.env.example` 中對應的地區 URL 設到非正式環境；服務重啟後用 `/api/maps/search`、`/api/maps/nearby`、`/api/maps/matrix` 及真實行程驗證。品質不達現有端點的地區留在公開備援。
4. 地圖座標分區已改用與 TW／JP／KR 匯入資料相對應的 Geofabrik extract 多邊形，涵蓋馬祖、沖繩與濟州，排除部分舊矩形框內的外國座標。extract 邊界包含近海緩衝，並非精確國界；海上、邊境及跨區路線仍須額外驗證。多邊形來源固定於 `src/server/maps/geofabrikRegions.ts`，更新區域 PBF 時應同步檢查邊界版本。

固定案例腳本可用 `node scripts/benchmark-local-maps.mjs --no-public` 驗證本地資料：六個參考景點的最近結果必須在 500 公尺內，且各點 1.5 公里內至少有一個具名餐廳。正式切換前另在部署網路執行 `node scripts/benchmark-local-maps.mjs --gate`；此模式要求每個案例都有可用的公開 Photon／Overpass 基準、本地座標誤差不高於基準加 100 公尺、具名餐廳數不低於基準。退出碼 `1` 表示本地品質未過，`2` 表示公開基準缺失或品質未達平行比對門檻。報告的 `regions` 欄位逐區列出通過數，不能以另一區的結果代替。

在 app 容器內執行時，設定 `BENCHMARK_PHOTON_LOCAL=http://photon-asia:2322`，以及 `BENCHMARK_OVERPASS_TW_LOCAL=http://overpass-tw/api/interpreter`、`BENCHMARK_OVERPASS_JP_LOCAL=http://overpass-jp/api/interpreter`、`BENCHMARK_OVERPASS_KR_LOCAL=http://overpass-kr/api/interpreter`。這些變數只改基準腳本的本地服務位址，不會改應用的供應端設定。公開端點超時或回 HTTP 406／429 後，腳本會停止本輪對同一端點的後續案例查詢；缺少公開基準仍使 `--gate` 失敗。

2026-11-06 容器網路重跑：`--photon-only --gate` 的台、日、韓六個案例全部取得公開 Photon 基準，最近座標誤差與自架 Photon 相同，各區 2/2 通過。完整 `--gate` 仍回 `2`：本地 Overpass 各區 2/2 有具名餐廳，公開 Overpass 首筆回 HTTP 406，後續案例按限流規則跳過，三區的 POI 平行比對均缺基準。正式供應端仍暫緩切換。依 [Overpass 公開 API 說明](https://wiki.openstreetmap.org/wiki/Overpass_API)，406／429 後應暫停查詢，公開服務也不保證穩定可用。

公開端點若回 HTTP 406／429，腳本會停止對該端點送出本輪後續案例；Photon 超時也會停止後續同端點查詢。`skipped` 代表缺少公開基準，正式切換門檻仍不通過。這遵循 [Overpass 公開 API 對 406／429 的暫停建議](https://wiki.openstreetmap.org/wiki/Overpass_API)；[Photon 公開服務](https://github.com/komoot/photon)亦不保證可用率。需要改用其他公開基準時，可設定 `BENCHMARK_PHOTON_PUBLIC` 與 `BENCHMARK_OVERPASS_PUBLIC`，並在部署網路重新執行完整六案例。

2026-11-06 新門檻實跑：本地 TW／JP／KR 各 2/2 通過，六個最近座標誤差為 7–186 公尺。`--gate` 回傳退出碼 `2`，因六個案例的公開 Photon／Overpass 均查詢失敗，三區各 0/2 有可用公開基準；正式切換維持暫緩。

2026-11-05 首輪本機固定案例（`node scripts/benchmark-local-maps.mjs --regions=TW,KR --no-public`）：台北 101 誤差 7 公尺、阿里山車站 186 公尺、景福宮 33 公尺、濟州東門市場 120 公尺；四處 1.5 公里內命名餐廳分別找到 20、12、19、16 個。Photon 搜尋耗時 19–123 毫秒，Overpass 耗時 49–835 毫秒。此結果僅代表固定點有命中；公開 Photon 從此環境超時，尚不能完成同條件品質比較。日本 OSRM 已完成匯入並啟動：淺草寺至晴空塔附近路線回傳約 1.9 公里、215 秒。

同日重跑本地與公開供應端（`node scripts/benchmark-local-maps.mjs --regions=TW,KR`）：四個本地案例仍全部命中，回應為 27–854 毫秒；公開 Photon 四次均在 10 秒超時，公開 Overpass 四次均回 HTTP 406。這只能證明本機環境的公開端點不可用，不能據此宣稱本地資料品質勝過公開資料。正式切換仍需在部署網路重做品質與可用率比較。

2026-11-06 再次對 TW／JP／KR 六個案例執行同條件對照：本地 Photon 最近結果誤差 7–186 公尺、回應 9–108 毫秒；本地 Overpass 各找到 12–20 個附近餐廳、回應 56–630 毫秒。公開 Photon 六次均在 10 秒超時，公開 Overpass 六次均回 HTTP 406。三地服務健康檢查與真實瀏覽器本地地圖流程均通過。公開端點在此環境仍無法作有效品質基準，因此正式切換門檻尚未達成。

開發容器已使用本地 Photon、台灣／韓國 Overpass、三地 OSRM、SearXNG 與本地圖磚。經 `http://127.0.0.1:3000/api/maps/*` 實測，台北 101 搜尋回 Photon、附近餐廳回 12 個 Overpass 地點、日本淺草寺至晴空塔路線約 1.9 公里／215 秒。這是開發環境試用；正式環境尚未改變供應端。

真實瀏覽器案例 `E2E_LOCAL_MAPS=1 npx playwright test tests/e2e/local-map-live.spec.ts` 已通過，畫面可完成「搜尋台北 101 → 查看 Photon 來源 → 查看附近 Overpass 餐廳」，並驗證日本路線 API；附近 POI 會排除 `various` 等佔位名稱、半徑外中心點，並依距離排序。

地圖搜尋預覽、已加入行程的資訊卡與 AI 修改預覽會從可信的 OSM node／way／relation ID 產生 OpenStreetMap 原始資料連結；無法辨識的 ID 不產生連結，舊 Google ID 的歷史相容連結維持原狀。純「附近／周圍／周邊」查詢由本地地名解析與 Overpass POI 執行，不額外呼叫 Serper／Tavily；若同時詢問營業、票價或活動等即時資料，仍依搜尋政策查外部來源。以本地服務實測「這份行程裡的淺草寺附近有餐廳嗎」，解析中心為淺草寺，回傳 12 個 Overpass 餐廳候選。

聊天詢問已保存景點附近地點時，先按已授權行程 ID 和精確名稱讀取已驗證的行程項目／地圖釘座標；若同名地點的座標互相衝突、保存座標不可讀或沒有可靠座標，再由 Photon 解析地名。這可在 Photon 暫時不可用時繼續用行程內已查核的地點搜尋周邊 POI，且不使用瀏覽器傳入的任意座標作行程依據。

日本本地固定案例（`node scripts/benchmark-local-maps.mjs --regions=JP --no-public`）中，淺草寺最近結果誤差約 90 公尺、福岡塔約 8 公尺；兩處 1.5 公里內分別找到 20、19 個餐廳。日本 Overpass 索引時間為 2026-11-04T21:20:29Z。開發容器已接入日本 Overpass；真實瀏覽器測試另外查詢日本附近餐廳，結果來源為 `overpass`。最初測試遇到 502，原因是日本容器仍在舊 Docker 網路，重新由目前 Compose 建立後通過。三地正式環境仍需在部署網路完成公開供應端同條件品質比較，才切換預設。

來源：[Photon](https://github.com/komoot/photon)、[Photon Docker](https://github.com/rtuszik/photon-docker)、[Overpass Docker](https://github.com/wiktorn/Overpass-API)、[OSRM](https://github.com/Project-OSRM/osrm-backend)、[VersaTiles](https://github.com/versatiles-org/versatiles-docker)。

網頁搜尋可另啟動 `docker compose -f docker-compose.maps.yml --profile search up -d searxng`，並在非正式環境設定 `SEARXNG_BASE_URL`。AI 先查本地 SearXNG 入口，無結果才走現有 Serper/Tavily 備援。SearXNG 本身仍向外部搜尋引擎發送查詢，不能當作離線資料庫；即時資訊仍須標示來源與查核時間。啟用前確認 `/search?q=tokyo&format=json` 回傳 JSON。

## Google 地圖程式清查

目前執行中的 `/api/maps/*`、`/api/map/geocode`、`/api/map/reverse-geocode`、`/api/map/place-details`、`/api/map/setup-check` 已改用 OSM 服務；`/api/map/place-photo` 對舊照片請求回傳 410。正式路線時間計算由 `osmRouteTravelTimeService` 處理。`src/server/places/geocodePlace.ts` 內未使用的 Google 地理編碼請求已移除，並以測試確認即使留有舊金鑰也不會向 Google 發出請求。`src/server/geo/geocodeService.ts`、`placesSearchService.ts`、`routeTravelTimeService.ts` 仍含舊 Google 請求函式，以供歷史資料型別與相容測試；目前沒有執行中的 API 或 planner 匯入這些請求函式。保留舊行程的 Google ID、網址欄位。Google 登入及 YouTube API 不屬於本次地圖遷移。
